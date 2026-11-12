# Backend de ordens de produção

Os [apontamentos de produção/perdas](../apontamentos/README.md) usam rotas
filhas de `/api/ordens-producao/{id}/apontamentos`, recurso ORDENS_PRODUCAO e
histórico persistente. São distintos do apontamento de quantidade final em
`/api/ordem_producao/{id}/itens/{itemId}/producao`: atualizam a projeção do item ao registrar a produção final, sem movimentar estoque
ou concluir etapas. Setores e fluxos usam SETORES e
FLUXOS_PRODUCAO; veja a [matriz](../../../docs/permissoes-modulos.md).

Implementação em `src/modules/producao`: schemas Zod, Repository Prisma, Service, autorização e Router HTTP. As ações operacionais da tela de produção usam as APIs reais. A integração de estoque/consumo utiliza as extensões DB-first descritas em [operações integradas](../../../docs/operacoes-integradas.md). O Prisma Client deve estar gerado a partir do schema atual (`npm run db:generate`).

## Segurança e respostas

Todas as rotas exigem `Authorization: Bearer <JWT>`, perfil `ADMINISTRACAO` ou `PRODUCAO`, usuário ativo e vínculo ativo com empresa ativa. `X-Empresa-Id` seleciona um vínculo existente; é obrigatório quando existem vários. A empresa e o responsável são definidos no servidor. `id_empresa` é opcional no cadastro e nos filtros, apenas para conferir compatibilidade com a empresa selecionada; outro valor retorna 403. O cliente não pode definir `id_usuario`.

Permissões do recurso `ORDENS_PRODUCAO`: `pode_ler` para consultas, `pode_criar` para cadastro/inclusão de itens, `pode_editar` para edições, apontamentos e operações de ciclo de vida, `pode_excluir` para cancelamento e remoção de itens do planejamento. ADMIN global ou vínculo EMPRESA dispensam a permissão explícita, mas continuam exigindo vínculo ativo. PUT/PATCH não aceitam `status`, impedindo cancelamento pela permissão de edição.

Rate limiting compartilhado com as URLs existentes: 120 leituras e 30 escritas por usuário/minuto, por processo. O limitador roda após validação do JWT e usa o ID autenticado, sem depender da caixa de Bearer, do texto do token ou de `X-Forwarded-For`. Não é distribuído entre instâncias. Tokens inválidos não criam contadores. O limite global de memória não descarta contadores ativos.

As novas URLs usam NextResponse e o helper global:

```json
{ "success": true, "data": { "rows": [], "count": 0, "page": 1, "limit": 20, "totalPages": 0 } }
```

Erros: `{ "success": false, "error": "mensagem" }`, com 400/401/403/404/409/429/500. Sucesso 200 ou 201 em cadastros. Respostas não são armazenadas em cache. A consulta de ID inexistente ou fora da empresa retorna 404, sem revelar dados de outra empresa. Relacionamentos inválidos, inativos ou indisponíveis na empresa retornam 400. Falhas internas são registradas no servidor e recebem mensagem genérica.

## Endpoints

Base: `/api/ordem_producao`.

| Método | Caminho | Operação |
| --- | --- | --- |
| GET | `/` | Listagem paginada de cabeçalhos e contadores de vínculos |
| POST | `/` | Cadastro PLANEJADA |
| GET | `/{id}` | Cabeçalho da ordem na empresa autorizada |
| PUT | `/{id}` | Substituição dos campos editáveis |
| PATCH | `/{id}` | Atualização apenas dos campos enviados |
| DELETE | `/{id}` | Cancelamento lógico, com verificação de efeitos |
| POST | `/{id}/liberar` | PLANEJADA → LIBERADA |
| POST | `/{id}/iniciar` | LIBERADA → EM_PRODUCAO; inicia primeira etapa quando há snapshot |
| POST | `/{id}/pausar` | EM_PRODUCAO → PAUSADA |
| POST | `/{id}/retomar` | PAUSADA → EM_PRODUCAO, preservando início |
| POST | `/{id}/replanejar` | LIBERADA → PLANEJADA, somente sem efeitos operacionais |
| POST | `/{id}/concluir` | Conclui última etapa/ordem em produção |
| GET | `/{id}/itens` | Itens paginados |
| POST | `/{id}/itens` | Inclui item, ficha de consumo previsto e snapshot de fluxo |
| PATCH | `/{id}/itens/{itemId}` | Quantidade/tamanho de item em planejamento |
| DELETE | `/{id}/itens/{itemId}` | Remove somente item do planejamento sem histórico operacional |
| PUT | `/{id}/itens/{itemId}/producao` | Registra produção efetiva na última etapa em execução |
| GET | `/{id}/etapas` | Etapas paginadas |
| POST | `/{id}/etapas/{etapaId}/iniciar` | Inicia a próxima etapa pendente |
| POST | `/{id}/etapas/{etapaId}/concluir` | Conclui etapa atual; a última encerra a ordem |

Operações de ciclo de vida não necessitam corpo. O status não é um campo editável no CRUD. As URLs anteriores `/api/ordens-producao` permanecem disponíveis com seu contrato legado (`{ ordem, ... }`/`{ error }`), incluindo abertura com número automático e um produto, avanço e etapas. Compartilham locks, autorização, rate limiting e verificações de conclusão. O estado legado AGUARDANDO_MATERIAL permanece no Prisma e nos contratos antigos; não foi adicionado às transições novas.

## Cadastro e edição

Para liberar ou iniciar, a OP deve ter local ativo para entrada, setor de
destino e produtos habilitados para produção e estoque. Itens com grade devem
identificar uma variação ativa da empresa. Produtos sem grade permanecem sem
variação.

`POST /api/ordem_producao/{id}/regularizar` preenche dados ausentes da futura
entrada em uma OP aberta. Envie `motivo` e os campos a corrigir `idLocal` (ausente, inativo ou incompatível),
`idSetor` (quando não houver fluxo nem setor) ou `variacoes` com
`{ idItem, idVariacao }`. A operação exige edição de produção e estoque.
Ela preserva dimensões de grade já registradas e recusa ordens que já tenham
entrada física. A trilha de auditoria registra valores anteriores, novos,
autor, data e motivo.

Exemplo de POST:

```json
{
  "numero": "OP-2026-001",
  "quantidade_planejada": "10.500",
  "prioridade": "NORMAL",
  "id_local_estoque": 3,
  "data_previsao": "2026-12-15",
  "observacao": "Lote piloto"
}
```

`numero`: obrigatório, trim, 1–50 caracteres. Unicidade por empresa verificada no Service e garantida pela restrição existente `uk_ordem_producao_empresa_numero`; conflitos concorrentes retornam 409. `prioridade`: BAIXA/NORMAL/ALTA/URGENTE, default NORMAL. Quantidade default zero, Decimal(15,3), até 12 dígitos inteiros e três decimais, nunca negativa; prefira strings para preservar precisão. Zero somente durante planejamento; liberação exige quantidade positiva e itens com insumos previstos.

Opcionais/nuláveis: `id_pedido_cliente`, `id_local_estoque`, `id_setor`, `data_inicio`, `data_previsao`, `observacao` (máximo 255). Relacionamentos são consultados com empresa autorizada; pedido cancelado não é aceito. Datas aceitam YYYY-MM-DD (UTC) ou ISO 8601 com fuso; previsão não pode anteceder início. Cadastro não preenche início automaticamente; início efetivo o preenche se estiver nulo. Não é possível iniciar com data de início futura.

PUT exige número, quantidade e prioridade; opcionais omitidos são limpos. PATCH preserva campos ausentes. Apenas PLANEJADA admite edição estrutural; nos demais estados não terminais, apenas observação/previsão podem mudar. CONCLUIDA e CANCELADA rejeitam edições. Uma meta positiva no cabeçalho sincroniza quantidade e insumos quando existe um único item, conforme o fluxo existente. Com vários itens, altera somente a meta geral, sem redistribuir quantidades; edite cada item separadamente. Meta zero pode ser mantida no planejamento, sem zerar itens, mas impede liberação. Nenhum campo automático ou protegido é aceito.

## Itens, fluxo e produção efetiva

POST de item: `{ "id_produto": 12, "quantidade": "10.500", "tamanho": "UNICO" }`. Exige produto ativo vinculado à empresa, habilitado para produção, ficha técnica vigente com componentes válidos e fluxo ativo. Reutiliza o cálculo existente (consumo unitário × quantidade, sem perda percentual, HALF_UP com três casas). O primeiro item cria etapas e snapshot; os demais precisam do mesmo fluxo/ordem de setores. Produto de um snapshot não é substituído. Limite operacional: 200 itens por ordem. Recalcular/remover itens altera somente planejamento sem execução; registros produtivos ou financeiros impedem essas alterações.

Liberação verifica produtos e componentes em lote, sem transformar planejamento em estoque. A reserva explícita dos materiais ocorre no fluxo operacional integrado, com pendências visíveis. Início, pausa, retomada e etapas reutilizam os Services existentes de produção/fluxos, preservando snapshot e movimentações entre setores. Não é permitido pular etapas. Movimentações em trânsito impedem avanço/conclusão.

Apontamento é o total acumulado efetivamente produzido, com valor esperado para concorrência:

```json
{ "quantidade_produzida": "7.125", "quantidade_esperada": "0" }
```

Em ordens sem snapshot com quantidade confirmada apenas no item, use
`motivo_ajuste_legado` para reduzir o total de forma auditável. Envie a quantidade
atual em `quantidade_esperada`. Quando houver apontamentos anteriores, o total
declarado respeita a disponibilidade comprovada e passa a ser vinculado ao
apontamento final. Se já existir um apontamento final, use correção ou estorno
pelo ID do apontamento. A perda integral comprovada permite concluir o item com
zero peças boas.

Com snapshot e apontamentos detalhados na etapa final, esse PUT **confirma** a
soma válida daquela etapa, sem criar outro apontamento. Registro/correção/estorno
atualiza a projeção do item atomicamente; produção e perda são independentes.
Sem detalhamento final, o contrato acumulado registra somente o delta positivo,
com vínculo na nova tabela producao_confirmacao. Registro detalhado sem vínculo
após esse fluxo acumulado retorna 409; correção/estorno pelo ID é explícito.
Consulte [o contrato combinado](../apontamentos/README.md#relação-com-a-confirmação-final-da-op)
para sequências, idempotência, concorrência e reconciliação de legados.

O PUT aceita Idempotency-Key opcional de 8–128 caracteres ASCII visíveis sem
espaços. Sem header, a identidade é derivada do comando normalizado. Chave com
outro autor/conteúdo ou replay após alteração do estado produtivo retorna 409,
sem restaurar produção corrigida/estornada. Nova operação após reconciliação
exige consultar os valores atuais e utilizar outra chave explícita.

Sem snapshot (fluxo legado), preserva início efetivo, ausência de movimentações
em trânsito e passagem por todos os setores configurados. O item e a auditoria
guardam o total/delta, com confirmação LEGADO; não se fabrica etapa nem linha
sem FK válida. Nenhum desses registros representa entrada de acabado no estoque.

Conclusão exige produção efetiva positiva ou perda integral comprovada em cada item, início válido, fluxo concluível e ausência de reservas ativas, necessidades não encerradas, compras/pedidos pendentes e consumos inconsistentes. Não copia quantidade planejada para produzida e não exige igualdade entre ambas. Conclusão preenche `data_conclusao`; nunca recebe esse campo do cliente.

## Transações, histórico e limites das integrações

Escritas usam transações Serializable, lock da empresa e releitura da ordem sob `FOR UPDATE`. Caminhos legados também bloqueiam a ordem antes de ler. Status/setor e apontamentos usam atualizações condicionais. Conflitos de serialização/unicidade/FK retornam 409, sem repetição automática. Auditoria e alterações pertencem à mesma transação; uma falha reverte tudo. As operações de ciclo de vida reutilizam os Services existentes dentro da transação corrente, sem transações aninhadas.

Cancelamento consulta reservas, consumos, estoque, compras, pedidos de compra, necessidades, movimentos de setores, apontamentos e obrigações financeiras das compras relacionadas. Também consulta etapas executadas. Havendo qualquer efeito não reversível pelos serviços disponíveis, retorna 409 com motivo. Sem impedimentos, altera somente status para CANCELADA e audita. Nunca apaga a ordem, notas fiscais, compras, pagamentos ou histórico produtivo. Ordens concluídas ou já canceladas não podem ser canceladas.

**Integração operacional:** consumo real é registrado em `/api/ordem_producao/{id}/consumos`, com saída e consumo da reserva indivisíveis. Ao confirmar o último consumo de um material, as sobras são liberadas; divergência do planejado exige motivo. Conclusão exige esses registros e movimentos íntegros e grava ENTRADA_PRODUCAO da quantidade efetivamente produzida, por item, no local físico da fábrica configurado na OP. A chegada à loja ocorre por transferência recebida. Os caminhos novos e legados compartilham essa conclusão, sem baixa repetida de insumos.

Cancelamento sem outros efeitos irreversíveis libera reservas integradas e cancela suas necessidades sem consumo, na mesma transação. Reservas legadas, consumo, execução e obrigações não reversíveis continuam bloqueando. Não há estorno financeiro/de estoque ou perda automática. OP concluída antiga sem movimentos identificados retorna `baixaEstoque: pendente_regularizacao`, sem inventar entrada retroativa. Detalhes, permissões adicionais de ESTOQUE e implantação em [operações integradas](../../../docs/operacoes-integradas.md).

A perda integral comprovada conclui o item com zero peças boas e sem entrada de produto acabado. O consumo real registrado continua no livro.

O modelo ordem_producao não contém `data_cadastro`, `data_atualizacao` nem relação de custos própria. Esses campos não são inventados, preenchidos ou usados como ordenação. A rastreabilidade das escritas usa auditoria existente. Consultas de movimentação de estoque consideram as origens ORDEM_PRODUCAO/PRODUCAO/CONSUMO_PRODUCAO; novas convenções de origem devem ser integradas pelo módulo de estoque, sem presumir que `origem_id` isolado identifica uma ordem.

## Consulta

A tela `/producao/ordens` consulta `GET /api/ordens-producao`. A rota
usa o envelope paginado abaixo, exige leitura em `ORDENS_PRODUCAO` e
aceita os filtros de cabeçalho da listagem, incluindo
`status=AGUARDANDO_MATERIAL` para ordens legadas. A tela usa busca pelo
número, situação e paginação. A empresa é aplicada antes da contagem e da
seleção da página. Cada linha contém ID, número, situação, prioridade,
quantidade planejada, datas, setor atual e primeira etapa pendente ou em
execução do snapshot. Os itens trazem referências de produto, cor e
tamanho e quantidade produzida por item. Quantidades decimais são
strings. Uma página sem resultados retorna `rows: []`.

`GET /api/ordens-producao/opcoes?busca=` exige criação em
`ORDENS_PRODUCAO`. Retorna até 50 produtos vinculados à empresa, habilitados
para produção e estoque e com fluxo ativo, suas variações ativas e os locais
ativos da empresa. O fluxo vem do cadastro do produto. Na abertura a ficha
técnica vigente, o destino e a grade são revalidados no servidor.

O formulário usa `POST /api/ordens-producao` com `idProduto`,
`quantidade`, `idLocal` e, para produtos com grade, `idVariacao`. Os
campos novos são opcionais no contrato anterior. A abertura grava o item,
consumo planejado e snapshot na mesma transação. A edição usa
`PATCH /api/ordens-producao/{id}` com `statusEsperado`. Ambas aceitam
`Idempotency-Key` e devolvem a mesma confirmação em uma repetição da
operação original. A primeira abertura retorna 201 e a repetição retorna
200. A chave pertence à empresa, ao usuário e ao conteúdo da operação.

Para avançar, a tela envia situação e setor esperados. Ordens com snapshot
iniciam e concluem etapas com o ID da etapa. Concluir a última etapa encerra a
ordem. Ordens legadas sem snapshot usam `/encerrar`. Reservas, consumo real,
quantidade efetiva e entrada de acabado mantêm as regras operacionais e as
permissões de estoque existentes.

Listagens: `page=1`, `limit=20` por padrão, máximo 100, skip validado. Itens e etapas usam os mesmos parâmetros. Rows e count são consultados diretamente no Prisma com snapshot RepeatableRead; nenhuma listagem é filtrada em memória. Consulta individual retorna cabeçalho/contadores, sem carregar coleções; consulte sub-recursos paginados.

Filtros: `id_empresa` (conferência do contexto), `id_pedido_cliente`, `id_local_estoque`, `id_setor`, `id_usuario`, `status`, `prioridade`, `numero`, `busca` por número; `data_inicio_de/ate`, `data_previsao_de/ate`, `data_conclusao_de/ate`. Datas finais YYYY-MM-DD incluem o dia UTC completo. Filtros combinados e empresa obrigatória são aplicados no banco. Parâmetros repetidos/desconhecidos são rejeitados.

`ordenar_por`: id, numero, prioridade, data_inicio, data_previsao, data_conclusao; `ordem`: asc/desc. Ordenação padrão id desc, com ID como desempate quando necessário.

## Validação

`tests/operacoes-integradas.integration.test.mjs` exercita a listagem e as
ações da tela por HTTP com o Next compilado e MariaDB local. Além do
preparador de [operações integradas](../../../docs/operacoes-integradas.md),
a base de teste desta revisão precisa dos DDLs já existentes
`20261031000000_eventos_apontamentos_producao`,
`20261102000000_confirmacoes_producao`,
`20261105000000_plano_pagamento_compra` e
`20261110000000_revogacao_sessoes`.

```sh
npm test -- tests/unit/ordem_producao tests/unit/api/rate-limit.test.ts
node --test tests/producao.test.mjs
npm run typecheck
```

Para persistência, consumo, conclusão, transferência, entrega e financeiro use o cenário HTTP em `tests/operacoes-integradas.integration.test.mjs`, com banco local isolado preparado conforme [operações integradas](../../../docs/operacoes-integradas.md). Os runners antigos que não preparam consumo real/local de destino precisam dessas pré-condições; não se fabricam apontamentos para concluir.

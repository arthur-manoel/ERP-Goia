# Backend de ordens de produção

Implementação em `src/modules/producao`: schemas Zod, Repository Prisma, Service, autorização e Router HTTP. Backend apenas; nenhuma tela ou estrutura do banco foi alterada. O Prisma Client deve estar gerado a partir do schema atual (`npm run db:generate`).

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

Liberação verifica produtos e componentes em lote, sem exigir disponibilidade total de estoque nem criar reservas. Início, pausa, retomada e etapas reutilizam os Services existentes de produção/fluxos, preservando snapshot e movimentações entre setores. Não é permitido pular etapas. Movimentações em trânsito impedem avanço/conclusão.

Apontamento é o total acumulado efetivamente produzido, com valor esperado para concorrência:

```json
{ "quantidade_produzida": "7.125", "quantidade_esperada": "0" }
```

A API atualiza o total do item e insere apenas o delta em `ordem_producao_apontamento`, com setor, usuário e auditoria na mesma transação. Repetir o mesmo total não cria outro apontamento. Estado esperado desatualizado retorna 409; reduções exigem ajuste/estorno e são bloqueadas. Apontamentos exigem ordem EM_PRODUCAO e última etapa em execução. Não representam entrada de produto acabado no estoque.

Conclusão exige quantidade efetivamente produzida positiva em cada item, início válido, fluxo concluível, ausência de reservas ativas, necessidades não encerradas, compras/pedidos pendentes e consumos inconsistentes. Não copia quantidade planejada para produzida e não exige igualdade entre ambas. Não há política existente para concluir itens com produção integralmente perdida; esse caso permanece bloqueado, aguardando fluxo específico de perdas. Conclusão preenche `data_conclusao`; nunca recebe esse campo do cliente.

## Transações, histórico e limites das integrações

Escritas usam transações Serializable, lock da empresa e releitura da ordem sob `FOR UPDATE`. Caminhos legados também bloqueiam a ordem antes de ler. Status/setor e apontamentos usam atualizações condicionais. Conflitos de serialização/unicidade/FK retornam 409, sem repetição automática. Auditoria e alterações pertencem à mesma transação; uma falha reverte tudo. As operações de ciclo de vida reutilizam os Services existentes dentro da transação corrente, sem transações aninhadas.

Cancelamento consulta reservas, consumos, estoque, compras, pedidos de compra, necessidades, movimentos de setores, apontamentos e obrigações financeiras das compras relacionadas. Também consulta etapas executadas. Havendo qualquer efeito não reversível pelos serviços disponíveis, retorna 409 com motivo. Sem impedimentos, altera somente status para CANCELADA e audita. Nunca apaga a ordem, notas fiscais, compras, pagamentos ou histórico produtivo. Ordens concluídas ou já canceladas não podem ser canceladas.

**Limitações verificadas no projeto:** não existem Services de liberação de reserva ou estorno de consumo/estoque disponíveis para esta integração. Portanto, reservas ativas e execução prévia impedem cancelamento; não se simula sua liberação nem se excluem registros para contornar a regra. Não são criados consumos efetivos, necessidades, reservas, compras, contas a pagar ou entradas/baixas de estoque automaticamente. O módulo coordena o fluxo existente, calcula consumo planejado, registra produção efetiva e valida os efeitos persistidos; essas operações externas devem usar serviços próprios quando implementados. A conclusão permanece administrativa quanto ao estoque (`baixaEstoque: pendente` no contrato legado), não uma confirmação de baixa física. Não há novo mecanismo de estorno, perda ou recebimento parcial.

O modelo ordem_producao não contém `data_cadastro`, `data_atualizacao` nem relação de custos própria. Esses campos não são inventados, preenchidos ou usados como ordenação. A rastreabilidade das escritas usa auditoria existente. Consultas de movimentação de estoque consideram as origens ORDEM_PRODUCAO/PRODUCAO/CONSUMO_PRODUCAO; novas convenções de origem devem ser integradas pelo módulo de estoque, sem presumir que `origem_id` isolado identifica uma ordem.

## Consulta

Listagens: `page=1`, `limit=20` por padrão, máximo 100, skip validado. Itens e etapas usam os mesmos parâmetros. Rows e count são consultados diretamente no Prisma com snapshot RepeatableRead; nenhuma listagem é filtrada em memória. Consulta individual retorna cabeçalho/contadores, sem carregar coleções; consulte sub-recursos paginados.

Filtros: `id_empresa` (conferência do contexto), `id_pedido_cliente`, `id_local_estoque`, `id_setor`, `id_usuario`, `status`, `prioridade`, `numero`, `busca` por número; `data_inicio_de/ate`, `data_previsao_de/ate`, `data_conclusao_de/ate`. Datas finais YYYY-MM-DD incluem o dia UTC completo. Filtros combinados e empresa obrigatória são aplicados no banco. Parâmetros repetidos/desconhecidos são rejeitados.

`ordenar_por`: id, numero, prioridade, data_inicio, data_previsao, data_conclusao; `ordem`: asc/desc. Ordenação padrão id desc, com ID como desempate quando necessário.

## Validação

```sh
npm test -- tests/unit/ordem_producao tests/unit/api/rate-limit.test.ts
node --test tests/producao.test.mjs
npm run typecheck
```

Os testes unitários usam Prisma mockado e não comprovam locks/rollback contra MySQL real. O teste opt-in `tests/producao.integration.test.mjs` foi ajustado para exigir produção efetiva antes da conclusão. Ele usa somente fixtures em MySQL local com schema preparado, sem DDL/migrations; foi mantido sem execução neste desenvolvimento. Para rodá-lo, configure PRODUCAO_TEST_DATABASE_URL e execute `node --test tests/producao.integration.test.mjs`. A opção `--configured-db --http` também exercita o Next real; execute somente em banco local de testes e sem outra instância dev usando o mesmo lock.

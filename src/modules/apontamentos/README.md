# Apontamentos, perdas e correções — issue #38

Entrega de backend/banco. O consumidor atual
`src/components/producao/apontamento.tsx` usa estado do navegador e `useErp`;
não foi conectado à API nem incluído como prova de persistência.

## Estrutura conferida

A `develop` contém o SQL canônico
`prisma/migrations/20261023000000_apontamentos_perdas_producao/migration.sql`
e o model **ordem_producao_apontamento**, com ordem, item, setor, usuário,
DATE da ocorrência, DECIMAL(15,3) de produção/perda, motivo VARCHAR(255) e
DATETIME(3) de cadastro. Não contém `producao_apontamento`, empresa explícita,
ID da etapa nem chave de idempotência nessa tabela. A descrição do trabalho
anterior não foi tratada como DDL efetivamente publicado.

O SQL original foi preservado e executado em MariaDB local, com seus CHECKs de
quantidade/motivo e FKs compostas item/ordem e setor/ordem. A menor extensão
adotada é **producao_apontamento_evento**, script
`20261031000000_eventos_apontamentos_producao/migration.sql`:

- Tipo REGISTRO/CORRECAO/ESTORNO; empresa, ordem, etapa, item, setor e autor.
- Chave única `(id_empresa, chave_idempotencia)`, VARCHAR(36) ASCII `ascii_bin`.
- Hash SHA-256 do pedido normalizado, tipo/operação, ordem e alvo.
- Referência ao apontamento novo e/ou anterior; motivo e timestamp do evento.
- Unicidade do novo e do anterior: uma única substituição/estorno por registro.
- FKs compostas RESTRICT de empresa/ordem, ordem/etapa/setor, ordem/item,
  autor/empresa e ordem/item/setor/apontamento; CHECK da combinação do tipo.
- Três índices únicos adicionais nas tabelas existentes sustentam essas FKs.

Nenhuma linha legada é convertida, apagada ou ganha chave inventada. Ela continua
válida até ser explicitamente corrigida/estornada. Prisma foi atualizado a partir
da introspecção local; os nomes das relações de eventos foram simplificados.
As relações inversas são arrays no Prisma para compatibilidade com suas FKs
compostas; o SQL conserva a unicidade individual dos IDs novo/anterior.
CHECKs e collation ASCII continuam definidos no SQL, não no schema Prisma.

## Contratos HTTP

Autenticação real: `Authorization: Bearer <accessToken>` do login. Seleção por
`X-Empresa-Id`; vínculo, empresa e usuário ativos. Perfis funcionais aceitos são
ADMINISTRACAO/PRODUCAO, como na OP. Não usa sessão de desenvolvimento.
Empresa/autor/data de cadastro vêm do servidor; campos extras são rejeitados.

| Método e caminho | Permissão | Entrada |
| --- | --- | --- |
| GET `/api/ordens-producao/{id}/apontamentos` | ORDENS_PRODUCAO.pode_ler | `page` (1..1000000, padrão 1), `limit` (1..100, padrão 50) |
| POST `/api/ordens-producao/{id}/apontamentos` | ORDENS_PRODUCAO.pode_editar | Registro abaixo |
| POST `/api/ordens-producao/{id}/apontamentos/{idApontamento}/corrigir` | ORDENS_PRODUCAO.pode_editar | Valores substitutos e motivoCorrecao |
| POST `/api/ordens-producao/{id}/apontamentos/{idApontamento}/estornar` | ORDENS_PRODUCAO.pode_editar | `{ "motivo": "Registro duplicado" }` |

Escritas exigem `Content-Type: application/json` e `Idempotency-Key` de 8 a 36
caracteres `[A-Za-z0-9._:-]`; UUID é aceito. Decimais são **strings**, com até
12 inteiros e três casas, sem expoente, sinal ou arredondamento implícito.

```json
{
  "idEtapa": 21,
  "idItem": 35,
  "quantidadeProduzida": "8.000",
  "quantidadePerdida": "2.000",
  "motivoPerda": "Corte irregular",
  "dataApontamento": "2026-10-30"
}
```

`quantidadeProduzida`, `idEtapa`, `idItem` e a data são obrigatórios. Perda
omitida assume `0.000`; motivo omitido assume `null`. Valores não negativos;
produção+perda > 0. Perda total é válida: produção `0.000`, perda positiva.
Com perda, motivo obrigatório após trim, até 255 caracteres Unicode; sem perda,
motivo precisa ser `null` (string vazia também é rejeitada).

Correção recebe as mesmas quatro propriedades de valores/data, acrescidas de
`motivoCorrecao`, sem idEtapa/idItem. Corrige somente o registro daquela ordem,
mantendo item e etapa; motivo da correção é obrigatório, com trim e até 255
caracteres. Novo apontamento substitui o anterior nos cálculos. Estorno apenas
torna o alvo inválido, sem quantidades negativas. Ambos preservam os originais e
registram autor/data/motivo, vínculo e auditoria na mesma transação.

Sucesso novo retorna 201, replay retorna 200:
`{ evento, apontamento, repetido }`. `apontamento` é null em estorno; quantidades
retornam três casas e data da ocorrência `YYYY-MM-DD`. Timestamp de cadastro é
ISO com hora. Mesma chave/mesmo pedido normalizado/mesmo autor retorna o evento
existente; conteúdo, alvo, operação ou autor diferente retorna 409. A autorização
é novamente conferida antes de devolver um replay. Guarde a chave por operação,
inclusive quando houver falha de rede; não gere outra em cada tentativa.

Consulta retorna `rows`, `count`, `page`, `limit`, `totalPages`, `eventos`,
`eventosPaginacao` e `totais`. Cada linha informa `valido` e
`idEventoSubstituicao`; eventos preservam a cadeia anterior/novo. As duas listas
são paginadas independentemente pelos mesmos page/limit, com suas contagens;
estornos podem fazer a lista de eventos ter mais páginas que a de apontamentos.
Totais são integrais, independentes da página, por item e etapa; incluem produto,
cor, tamanho, unidade, planejada, disponível, produzida, perdida e restante.
Nunca se soma a produção de etapas diferentes como produção final da OP.

Erros usam `{ "error": "mensagem" }`: 400 entrada inválida, 401 autenticação,
403 vínculo/permissão, 404 ordem/etapa/item/alvo inacessível, 409 estado,
disponibilidade, correção incompatível ou chave em conflito, 413 corpo >64 KiB,
415 tipo de conteúdo, 429 limite de requisições e 500 falha interna. Respostas não armazenam cache.

## Estados, datas e quantidades

A OP precisa estar EM_PRODUCAO, PAUSADA ou CONCLUIDA; etapa EM_PRODUCAO ou
CONCLUIDA, com início real preenchido. Ocorrências tardias em etapas anteriores concluídas podem ser registradas
sem reabrir o fluxo. Alterar a etapa final ou corrigir/estornar após encerrar a OP
exige compensação e retorna 409 enquanto esse processo não estiver disponível. Planejadas, liberadas e canceladas não recebem
apontamento. Correção/estorno conserva essas condições de estado.

Data real entre o início da etapa e o dia atual no fuso **America/Sao_Paulo**,
o mesmo das formatações do ERP. A ocorrência usa DATE; horário do cadastro é
independente e vem do banco. Data futura e início ausente são rejeitados.

Na primeira etapa, entrada disponível = quantidade planejada **do item**. Nas
seguintes, entrada = produção válida acumulada da etapa imediatamente anterior.
Produção+perda válidas da etapa não podem ultrapassar essa entrada. A perda já
foi removida da saída produzida: não é descontada uma segunda vez. Etapa ausente
ou anterior com perda total fornece zero; não há fallback para o planejado.

Legados inconsistentes permanecem consultáveis: `pendencia` explica o problema
e `disponibilidade` é null. Para reconciliar, estorne explicitamente os registros
das últimas etapas para as primeiras, e depois registre os fatos confirmados em
ordem de etapa. Um estorno pode reduzir um excesso legado sem resolver todos de
uma vez, mas não pode aumentar nem criar excesso em outra etapa. Novos registros
e correções exigem que o resultado inteiro do item esteja consistente. Não há
preenchimento automático de produção, consumo ou movimentação presumida.

Correção que diminua a saída anterior e torne a sucessora inválida retorna 409;
nenhuma outra etapa é ajustada silenciosamente. Registro já substituído retorna
409: use seu substituto válido. Correções sucessivas preservam toda a cadeia.

Locks de empresa/ordem e transação Serializable protegem saldo e unicidade entre
requisições. Disputas transitórias são repetidas no máximo três vezes; sem sucesso,
retornam 409 e o cliente pode reenviar a **mesma** chave. Apontamento, evento e
auditoria confirmam juntos ou são revertidos juntos.

A unidade acompanha o produto, sem snapshot no apontamento. A API de produtos
impede mudança de unidade depois de qualquer apontamento, inclusive estornado,
e participa dos mesmos locks de empresa/produto para proteger o primeiro registro.
Alterações SQL diretas por administrador do banco devem preservar essa regra.

Apontamento não movimenta estoque, não prova consumo de matéria-prima, não transfere
peças e não conclui etapas. Na última etapa, registro/correção/estorno atualiza
`ordem_producao_item.quantidade_produzida` dentro da mesma transação.

## Relação com a confirmação final da OP

A fonte da produção final é a soma dos apontamentos **válidos da última etapa**.
Etapas anteriores representam a passagem das mesmas peças; não são somadas ao
produto final. Perdas são somadas separadamente. Dois fatos independentes de 3
peças somam 6; igualdade de quantidade não identifica duplicação.

O PUT `/api/ordem_producao/{id}/itens/{itemId}/producao` recebe um total acumulado,
nunca um incremento. Depois de um REGISTRO detalhado na última etapa, o PUT
apenas confirma o total válido: apontar 6 e confirmar 6 conserva uma linha de 6.
Um total diferente retorna 409; utilize corrigir/estornar pelo ID do fato.
Essa regra também vale em OP sem snapshot quando existem fatos detalhados na
última etapa; a ausência do snapshot não permite ignorar esse histórico.
Correção de 6 para 4 substitui a contribuição original por 4, sem apagar o
original. Estorno exclui aquela contribuição válida uma única vez e preserva
os outros fatos. Essas operações atualizam a projeção do item e a auditoria.

Sem REGISTRO detalhado na etapa final, o PUT preserva o fluxo acumulado anterior:
registra somente o delta positivo, com vínculo explícito entre confirmação e
apontamento. Se depois for enviado um REGISTRO detalhado para o mesmo item/etapa,
retorna 409 sem efeitos, pois o contrato não identifica se seria outra produção
ou a reapresentação das mesmas peças. Corrigir/estornar o ID explícito continua
permitido. Havendo detalhamento anterior, o delta respeita a disponibilidade
entre etapas; não se inventa saída em etapas ausentes. O modo acumulado sem
qualquer detalhamento preserva o contrato anterior de avanço da OP.

A nova tabela `producao_confirmacao` guarda autor, escopo, chave, hash do comando,
hash do estado produtivo e vínculo opcional com o fato novo. O PUT aceita
`Idempotency-Key` opcional (8–128 caracteres ASCII visíveis sem espaços).
Sem header, deriva uma identidade estável do autor, OP, item e decimais
normalizados, mantendo clientes anteriores. A mesma chave com outro conteúdo ou
autor retorna 409. Replay sobre estado alterado por registro/correção/estorno
retorna 409 mesmo se os números voltarem ao valor antigo (ABA). Para uma nova
produção intencional, consulte o estado atual e envie uma nova chave explícita.
Um replay válido não cria apontamento, confirmação ou auditoria adicional.

As duas APIs calculam e gravam sob os mesmos locks de empresa/OP e transação
Serializable. A confirmação revalida ORDENS_PRODUCAO.pode_editar usando o mesmo
TransactionClient. Conflitos, inclusive MariaDB 1020, retornam 409; o PUT não
repete automaticamente a transação. Na API detalhada permanece o limite de três
tentativas. Falha em evento, confirmação, projeção ou auditoria reverte tudo.

Históricos antigos mistos, sem vínculo inequívoco, retornam 409: não são
apagados ou deduplicados por quantidade. Reconciliar explicitamente os IDs.
OP encerrada ou com movimentação física nas origens oficiais bloqueia alteração
dos totais sem compensação; nenhuma dessas rotas ajusta estoque silenciosamente.

## Aplicação do banco em outro ambiente

O responsável pelo banco deve conferir os SHOW CREATE e o histórico efetivo:
`permissoes_usuario`, `ordem_producao`, `ordem_producao_item`,
`ordem_producao_fluxo_setor`, `ordem_producao_apontamento` e `usuario_empresa`.
Se existir apenas `producao_apontamento` com outro contrato, conciliar primeiro;
não aplicar esta extensão presumindo que seja a mesma tabela.

Ordem: estrutura base atual do ERP, enum `20261022000000` se ainda faltar,
apontamentos `20261023000000` se ainda faltar, extensão `20261031000000`,
e incremento `20261102000000_confirmacoes_producao`. Este último cria somente
`producao_confirmacao`, com FKs de escopo/autor/fato, chave ASCII única por empresa
e CHECKs de tipo/quantidade; preserva todas as linhas e quantidades existentes.
Não repetir SQL/índice já aplicado e não executar reset, db push ou adoção cega
de migrations. Preservar dados e conferir nulabilidade, precisão, índices,
CHECKs, FKs RESTRICT e ascii_bin após aplicação aprovada. Introspectar com
`npm run db:pull`, revisar o diff e gerar o cliente. Preparar o banco antes de
habilitar essas APIs no ambiente; a PR não aplica SQL remoto.

**DDL testado localmente não significa DDL aplicado no banco compartilhado ou em produção.**

## Desenvolvimento e validação

`scripts/preparar-permissoes-perdas-test.mjs` aceita somente host local, banco
com sufixo `_test` e vazio. Reconstrói o snapshot fixo da develop e aplica o SQL
canônico dos apontamentos, eventos e confirmações. Arquivos locais de inspeção
ficam em um diretório próprio por execução, sem sobrescrever registros anteriores. Recusa bases existentes, não remove dados
e não usa a URL remota. Não é uma ferramenta de implantação/reconciliação.
O baseline sintético não representa expressões geradas ou todos os CHECKs dos
outros módulos. Para MariaDB, somente nele, as duas FKs antigas de item_venda para
cor/tamanho usam ON UPDATE RESTRICT: MariaDB rejeitou CASCADE entre id_empresa
nullable do catálogo e NOT NULL do item. Essa compatibilidade é explícita,
mais restritiva, não muda os scripts históricos nem os ambientes compartilhados.
O diff banco/schema local confirma somente essas duas divergências anteriores
à entrega; os modelos afetados pelos apontamentos coincidem.

Com Node compatível com `registerHooks`, configure uma URL local nas duas
variáveis DATABASE_URL e PERMISSOES_PERDAS_TEST_DATABASE_URL e execute:

```text
node scripts/preparar-permissoes-perdas-test.mjs
npm run db:generate
npm run db:validate
npm test
node --test tests/auth.test.mjs tests/clientes.test.mjs tests/producao.test.mjs tests/usuarios.test.mjs
node --test tests/permissoes-perdas.integration.test.mjs
npm run lint
npm run format:check
npm run typecheck
npm run build
node tests/permissoes-perdas.integration.test.mjs --http
node tests/producao-combinada.integration.test.mjs
```

A suíte de banco usa fixtures próprias, constraints efetivas, concorrência e um
trigger temporário de falha da auditoria no banco de teste; remove apenas seus
dados e trigger. `--http` inicia o build local com NODE_ENV=production, JWT real e
sem DEV_ID_*. Ausência de banco não é resultado aprovado nem skip dessa suíte.

Os limites compartilhados da produção permanecem ativos: 120 leituras e 30
escritas por usuário/minuto, por processo, incluindo as URLs novas e legadas.
Os cenários HTTP de integração usam processos separados para isolar contadores,
mantendo o banco persistido e o limitador real habilitado. Totais dos itens da
ordem são agregados em uma única consulta, sem uma consulta por item.

Para passar `--http`, execute o arquivo diretamente, conforme acima; o executor
`node --test` não repassa essa opção ao arquivo. Outra forma explícita é definir
PERMISSOES_PERDAS_TEST_HTTP=1 antes de `node --test`. Nesse modo a suíte exige o
servidor real e nunca volta silenciosamente à chamada direta dos handlers.

Para integrar o frontend depois: substituir useErp/estado temporário por estas
rotas, usar IDs reais da ordem/item/etapa, strings decimais e chave estável, tratar
perda total, conflitos e paginação, e recarregar histórico/totais após gravação.
Não enviar empresa/usuário no corpo e não transformar apontamento em movimentação.

A suíte combinada exige o build atual e login real via `/api/auth/login`; cria
OP, item e início pelas rotas reais, com permissões explícitas e fixtures locais
próprias. Mantém fixtures no banco dedicado para inspeção. Usa trigger temporário
para comprovar rollback e o remove ao terminar. Opcionalmente, PR120_HTTP_LOG
aponta para um arquivo **local ignorado** com requisições, estados e auditorias,
sem tokens ou credenciais. Resultados observados ficam na descrição da PR.

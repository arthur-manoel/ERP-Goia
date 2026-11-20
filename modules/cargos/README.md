# API de Cargos

Use `Authorization: Bearer <token>` e `X-Empresa-Id: <id>`. O servidor exige
usuário, empresa, vínculo e cargo do ator ativos. Cada operação verifica o
recurso `CARGOS` no vínculo. A regra de administração já adotada pelo ERP
aplica-se ao responsável da empresa e ao ADMIN global com vínculo ativo.
Para gerir outra empresa, o administrador seleciona um vínculo válido dela.

| Método e rota | Permissão | Entrada e resultado |
| --- | --- | --- |
| GET `/api/cargos` | `pode_ler` | Filtros e página de cargos com contagem de vínculos |
| GET `/api/cargos/[id]` | `pode_ler` | Cargo, contagem de vínculos e cabeçalho `ETag` |
| POST `/api/cargos` | `pode_criar` | JSON de cadastro, cargo criado com `ETag`, HTTP 201 |
| PUT `/api/cargos/[id]` | `pode_editar` | `If-Match` e JSON de substituição, cargo atualizado com `ETag` |
| PATCH `/api/cargos/[id]` | `pode_editar` | `If-Match` e JSON parcial, cargo atualizado com `ETag` |
| DELETE `/api/cargos/[id]` | `pode_excluir` | `If-Match`, inativação lógica e novo `ETag` |
| POST `/api/cargos/[id]/ativar` | `pode_editar` | `If-Match`, reativação e novo `ETag` |
| GET `/api/cargos/[id]/usuarios` | Administração da empresa | Página de usuários vinculados com situação do cadastro e do vínculo |
| GET `/api/cargos/[id]/historico` | Administração da empresa | Página de auditorias, incluindo valores anteriores e posteriores |

A listagem aceita `id`, `id_empresa`, `nome`, `descricao`, `search` (nome e
descrição), `status` (`ATIVO` ou `INATIVO`) e `aprova_cancelamento`
(`true` ou `false`). Ordene por `id`, `nome`, `descricao`, `status` ou
`aprova_cancelamento`, com `sortBy` e `sortOrder=asc|desc`. O padrão é
nome ascendente, com ID como desempate. Listas e subconsultas usam
`page` (padrão 1) e `limit` (padrão 10, máximo 100).

O cadastro exige `id_empresa` igual ao cabeçalho e `nome` de 2 a 100
caracteres. A descrição aceita até 255 caracteres ou `null`.
`aprova_cancelamento` é booleano e começa falso. Somente a administração
pode alterar a flag. PUT exige nome e a flag e limpa a descrição quando
omitida. PATCH aceita um ou mais campos editáveis e preserva os omitidos.
O status muda pelos endpoints de ativação e inativação. Repetir uma mudança
já aplicada devolve 200 sem registrar outra transição.

Exemplo de cadastro, edição e transições com os cabeçalhos de autenticação acima.

```http
GET /api/cargos?page=1&search=gerente&status=ATIVO
GET /api/cargos/12
GET /api/cargos/12/usuarios
GET /api/cargos/12/historico

POST /api/cargos
Content-Type: application/json

{"id_empresa":10,"nome":"Gerente","descricao":"Operações"}

PUT /api/cargos/12
If-Match: <ETag da consulta>
Content-Type: application/json

{"nome":"Gerente","descricao":null,"aprova_cancelamento":false}

PATCH /api/cargos/12
If-Match: <ETag atual>
Content-Type: application/json

{"descricao":"Operações e compras"}

DELETE /api/cargos/12
If-Match: <ETag atual>

POST /api/cargos/12/ativar
If-Match: <ETag atual>
```

Sucesso usa `{"success":true,"data":{...}}`. Nas listas, o objeto interno
contém `data`, `page`, `limit`, `total`, `totalPages`, `hasNextPage` e
`hasPreviousPage`. Erro usa `{"success":false,"error":"mensagem"}`.
400 indica entrada inválida, 401 sessão inválida, 403 acesso negado,
404 cargo fora do escopo, 409 conflito (nome, revisão ou vínculo ativo),
429 limite de requisições e 500 falha interna.

A revisão usa os dados do cargo e o ID da última auditoria. Escritas usam
transação Serializable, lock do cargo e auditoria obrigatória. A unicidade
existente usa a collation do MySQL. O nome é armazenado com a apresentação
informada, após trim e comparação sem distinção de caixa na collation padrão.

Para transferir, use `PATCH /api/usuarios/[id]` com `{"idCargo":13}`,
conforme permissões de Usuários. O fluxo valida destino ativo na mesma empresa,
preserva o vínculo e o nível administrativo, registra antes e depois e revoga
a sessão. Cargo com vínculo ativo retorna 409 ao inativar. A aprovação de
cancelamentos continua subordinada às permissões de Pedidos e ao fluxo do
documento, e o solicitante não consegue aprovar sua própria solicitação.

A API usa o limitador existente por processo, com 120 leituras e 30 escritas
por minuto por usuário. Em vários processos, o limite global depende de
controle compartilhado no gateway. Defina `CARGOS_TRUST_PROXY=true` apenas
quando o proxy substituir `X-Real-IP` por um IP verificado. Isso também
habilita limites de 300 leituras e 90 escritas por IP e o registro do IP
na auditoria. A autorização consulta o banco a cada operação.

A migration `20261120010000_permissao_cargos` acrescenta o recurso ao enum
existente. Antes de aplicar, confirme que a collation de `cargos.nome` é
case-insensitive (sufixo `_ci`, como no baseline). A tabela de cargos,
suas relações e a restrição `uk_cargo_empresa_nome` são reutilizadas.

`npm run test -- tests/unit/cargos` executa a suíte de Cargos. Para o teste
com MySQL, configure `CARGOS_TEST_DATABASE_URL` com um banco local vazio,
de sufixo `_test`, com schema e migration aplicados. Execute
`node --test --test-force-exit tests/cargos-banco.integration.test.mjs`.

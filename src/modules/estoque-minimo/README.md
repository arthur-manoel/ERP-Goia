# API de estoque mínimo por localização

Usa o mesmo contrato de autenticação das ordens de produção: `Authorization: Bearer <JWT>` e, quando o usuário tem mais de uma empresa ativa, `X-Empresa-Id: <id>`. O JWT identifica o usuário; o vínculo ativo e a permissão `ESTOQUE` são confirmados no banco a cada requisição. Administradores também precisam de vínculo ativo.

| Método | Rota | Resultado |
| --- | --- | --- |
| `GET` | `/api/estoque-minimo/empresas` | Empresas ativas onde o usuário pode ler estoque |
| `GET` | `/api/estoque-minimo?somenteInsumos=true` | Posições físicas, permissão de edição e indicador do dashboard |
| `PUT` | `/api/estoque-minimo` | Configura mínimo por local com JSON `{ "idProduto": 1, "idLocalEstoque": 2, "quantidadeMinima": "10.000" }` |

`somenteInsumos` é opcional e aceita apenas `true` ou `false`. O valor mínimo é string decimal não negativa, com até 12 dígitos inteiros e três casas decimais. A resposta de consulta usa strings para quantidades e déficits; nunca serializa objetos `Decimal` do Prisma. A configuração é idempotente e auditada na mesma transação. A quantidade reservada não entra na classificação.

Erros têm formato `{ "error": "mensagem" }`: 400 para dados ou seleção de empresa inválidos, 401 para JWT ausente/inválido, 403 para acesso negado, 409 para conflito concorrente e 500 para falha inesperada. Todas as respostas usam `Cache-Control: no-store`.

# API de Empresas

Os endpoints usam `Authorization: Bearer <token>`. O cabeçalho opcional
`X-Empresa-Id` restringe a listagem e deve corresponder ao ID das rotas
individuais. A autorização vem do banco. O perfil funcional
`ADMINISTRACAO` por si só não concede administração global. O usuário
precisa ter `usuarios.nivel_acesso = ADMIN` para administrar todas as empresas.

| Método e rota | Operação e permissão | Entrada |
| --- | --- | --- |
| GET `/api/empresas` | Lista empresas do usuário com `EMPRESAS.pode_ler`, ou todas para ADMIN | Query abaixo |
| GET `/api/empresas/[id]` | Consulta cadastral sob a mesma permissão de leitura | ID inteiro positivo |
| POST `/api/empresas` | Cadastra empresa ativa. ADMIN | JSON de cadastro |
| PUT `/api/empresas/[id]` | Substitui cadastro. ADMIN ou `EMPRESAS.pode_editar` por vínculo ativo em empresa ativa | JSON completo dos campos editáveis |
| PATCH `/api/empresas/[id]` | Altera campos selecionados. Mesma permissão de edição | JSON parcial não vazio |
| DELETE `/api/empresas/[id]` | Inativa e registra responsável e data. ADMIN | ID inteiro positivo |

Vínculos ativos com nível `EMPRESA` seguem a autorização de catálogos.
Com sessão válida, usuários com leitura podem consultar o cadastro histórico
de empresas inativas. A descoberta da empresa de operação segue o fluxo
existente de autenticação, com empresas ativas. Se o usuário deixar de ter um
vínculo ativo que determine seu perfil funcional, a política da sessão pode
impedir sua autenticação. Administradores globais mantêm acesso histórico.

O POST exige `razao_social` e `cnpj`. Campos opcionais são `nome_fantasia`,
`inscricao_estadual`, `email`, `telefone`, `endereco`, `numero`, `complemento`,
`bairro`, `cidade`, `estado`, `cep`, `logo_url` e `cor_tema`. No PUT,
`razao_social` é obrigatória, opcionais omitidos são limpos e a cor omitida
volta a `#22c55e`. CNPJ omitido é preservado. No PATCH, omissão preserva
o valor, `null` limpa um campo anulável e texto vazio é inválido.
Campos protegidos e extras são rejeitados.

A alteração de CNPJ é exclusiva de ADMIN. A API aceita apenas CNPJ numérico,
com máscara brasileira opcional e dígitos verificadores válidos. Telefones são
armazenados como dígitos com DDD, com prefixo internacional opcional iniciado
por `+`. A URL da logo deve usar HTTPS, sem credenciais na URL.

Somente ADMIN pode enviar `status` no PUT ou PATCH. Para reativar, envie
`{"status":"ATIVA"}` via PATCH. A reativação limpa os marcadores atuais de
inativação e mantém o histórico na auditoria. DELETE repetido devolve o cadastro
inativo e preserva data e responsável originais.

A listagem aceita `page` (1), `limit` (10, até 100), `search`, `razao_social`,
`nome_fantasia`, `cnpj`, `cidade`, `estado`, `status`, `sortBy` e `sortOrder`
(`asc` ou `desc`). A ordenação aceita ID, razão social, nome fantasia, CNPJ,
cidade, estado, status e as datas de cadastro, criação e atualização.

Exemplos, usando os cabeçalhos de autenticação acima.

```http
GET /api/empresas?page=1&limit=10&estado=GO&sortBy=razao_social
GET /api/empresas/10

POST /api/empresas
Content-Type: application/json

{"razao_social":"Empresa Exemplo","cnpj":"11.222.333/0001-81"}

PUT /api/empresas/10
Content-Type: application/json

{"razao_social":"Empresa Exemplo Ltda.","cidade":"Goiânia","estado":"GO"}

PATCH /api/empresas/10
Content-Type: application/json

{"email":"contato@example.test"}

DELETE /api/empresas/10
```

Sucesso retorna `{"success":true,"data":{...}}`. A listagem inclui
`data`, `page`, `limit`, `total`, `totalPages`, `hasNextPage` e
`hasPreviousPage` dentro do envelope. POST retorna 201, demais métodos
retornam 200. Erros usam `{"success":false,"error":"mensagem"}`.

- 400 para entrada inválida ou corpo superior a 16 KiB.
- 401 para sessão ausente ou inválida.
- 403 para operação administrativa sem permissão.
- 404 para empresa inexistente ou fora do escopo da operação.
- 409 para CNPJ duplicado ou conflito de persistência.
- 429 após 120 leituras ou 30 escritas por minuto por usuário.
- 500 para falha interna, com detalhes somente no servidor.

A auditoria usa a tabela existente. Registra operação, usuário, empresa,
ID, data, User-Agent limitado a 512 caracteres e IP quando há proxy
confiável. Snapshots registram dados cadastrais essenciais, status e datas.
Para contato, endereço e URL, registra apenas quais campos mudaram.

O limitador segue a infraestrutura em memória por processo do ERP. Em ambiente
multi-instância, os limites globais dependem de um limitador compartilhado no
gateway. Com `EMPRESAS_TRUST_PROXY=true`, o proxy precisa remover qualquer
`X-Real-IP` de entrada e inserir o IP verificado. Nesse modo também se aplicam
limites de 300 leituras e 90 escritas por minuto por IP.

## Migration

A migration `20261120000000_cadastro_empresas` mantém a UNIQUE de CNPJ,
normaliza a máscara brasileira, preserva as datas legadas e acrescenta
colunas, índices e o recurso de permissão. Antes de aplicar, confirme que o
enum do banco contém a mesma lista anterior do schema e verifique colisões
e CNPJs legados fora do formato.

```sql
SELECT REPLACE(REPLACE(REPLACE(cnpj, '.', ''), '/', ''), '-', '') AS canonico,
       COUNT(*) AS registros
FROM empresas
GROUP BY canonico
HAVING COUNT(*) > 1;

SELECT id, cnpj FROM empresas
WHERE cnpj NOT REGEXP '^([0-9]{14}|[0-9]{2}[.][0-9]{3}[.][0-9]{3}/[0-9]{4}-[0-9]{2})$';
```

Resolva divergências antes da aplicação. CNPJs de 14 dígitos que já existiam
não passam por revalidação retroativa de dígitos na migration. Use backup e
janela de manutenção, pois MySQL confirma DDL implicitamente. Depois da
aplicação, regenere o Prisma Client. Nenhuma dependência adicional é necessária.

## Testes

`npm run test -- tests/unit/empresas` executa validações, contratos, permissões,
paginação e rate limiting. Para integração, prepare um banco MySQL descartável
com o schema e a migration aplicados, configure `EMPRESAS_TEST_DATABASE_URL`
com uma URL local de banco terminado em `_test` e execute
`node --test --test-force-exit tests/empresas-banco.integration.test.mjs`.
O teste deixa as fixtures disponíveis para inspeção.

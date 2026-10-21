# Cores

Segue o padrão de produtos e tamanhos, usando o Prisma Client atual. As rotas
retornam `{ success, data?, error? }`.

- `POST /api/cores`: exige `id_empresa` e `nome`; `codigo_hex` é opcional,
  nullable, no formato `#RRGGBB` e normalizado para maiúsculas. Status default `ATIVA`.
- `GET /api/cores`: filtros opcionais `id_empresa`, `nome` (igualdade) e `status`.
  Paginação `page=1`, `limit=20`, máximo 100; ordenação por nome e ID.
- `GET /api/cores/:id`: consulta por ID ou 404.
- `PUT` ou `PATCH /api/cores/:id`: atualização parcial não vazia; rejeita `id` e preserva
  campos omitidos. `codigo_hex: null` limpa o código.
- `DELETE /api/cores/:id`: altera status para `INATIVA`, retornando 200,
  inclusive se já estiver inativa, ou 404 quando não existir.

Nome admite até 100 caracteres. A unicidade é por `(id_empresa, nome)`, inclusive
para cores inativas. O Prisma atual permite empresa nula: registros legados assim
ficam fora do escopo autorizado. A API exige empresa na criação e não aceita defini-la
como null na atualização. Nenhuma alteração de banco foi feita.

```json
{ "id_empresa": 10, "nome": "Branco", "codigo_hex": "#FFFFFF" }
```

Listagem: `{ success: true, data: { rows, count, page, limit, totalPages } }`.
Erros Zod e FKs inválidas retornam 400 com detalhes; duplicidade retorna 409 com
`Já existe uma cor com este nome nesta empresa.`; ID ausente retorna 404 com
`Cor não encontrada.`. Erros inesperados retornam 500 com mensagem genérica e log interno.

Todas as rotas exigem `Authorization: Bearer <access_token>`, usuário, empresa e vínculo ativos, além da permissão da operação em `permissoes_usuario`. Sem token válido: 401; sem vínculo/permissão: 403. IDs fora do escopo retornam 404. O filtro `id_empresa` é opcional, mas somente empresas autorizadas entram na consulta. Veja [autorização dos catálogos](../catalogos/README.md).

`busca` pesquisa parcialmente em `nome` OU `codigo_hex`, combinado aos demais filtros. Exemplo: `GET /api/cores?page=2&limit=10&busca=azul&status=ATIVA`. A consulta retorna somente a página atual; `count` conta todos os resultados filtrados autorizados.

Testes: `npm test -- tests/unit/cores`.

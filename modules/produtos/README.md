# Módulo produtos

## Integração

O módulo usa a instância existente em `src/lib/prisma.ts`, com adapter MariaDB,
e importa tipos e erros do Prisma 7 gerado em `src/generated/prisma/client`.
Para regenerar o Client a partir de `prisma/schema.prisma`, execute
`npm run db:generate`. A validação usa Zod 4.

O model `produtos` atual tem `id` autoincremental, status com default `ATIVO`,
`data_cadastro` com default `now()` e quatro flags Boolean. Os limites Zod seguem
os varchar do schema: código 100, nome 150, descrição 255 e unidade 20 caracteres.

O JSON de entrada usa exclusivamente números `0` e `1` nos flags; os recursos
retornados usam os Boolean do Prisma. `codigo` possui apenas `@@index` no schema
atual, por isso `findByCodigo` usa `findFirst`, ordenado por ID. A criação verifica
duplicatas previamente, mas essa consulta não impede duplicatas concorrentes;
uma garantia de unicidade exige uma restrição UNIQUE no banco. Nenhuma migração
ou alteração de banco foi executada.

## Endpoints

- `GET /api/produtos?page=1&limit=20&id_categoria=1&id_tipo_produto=2&status=ATIVO&codigo=P001`
  retorna `{ success: true, data: { rows, count, page, limit, totalPages } }`.
  Os filtros são combinados com AND; código usa igualdade conforme a collation
  do banco. Sem status, inclui ativos e inativos. O limite máximo é 100.
- `POST /api/produtos` retorna 201 com o produto criado.
- `GET /api/produtos/1` retorna 200 com o produto ou 404.
- `PUT /api/produtos/1` aceita um objeto parcial não vazio. `id`, `codigo` e
  `data_cadastro` são rejeitados, mesmo se o valor for igual ao atual. A proibição
  explícita de alterar código prevalece sobre a instrução conflitante de validar
  sua alteração. Omitir status preserva seu valor; `INATIVO` e `ATIVO` são aceitos.
- `DELETE /api/produtos/1` inativa o produto e retorna
  `{ "success": true, "data": { "message": "Produto inativado com sucesso." } }`.
  Repetir a exclusão de um produto inativo também retorna 200.

O App Router exige `[id]/route.ts` para URLs com ID: GET/POST ficam na coleção;
GET/PUT/DELETE ficam na rota dinâmica. Os handlers aguardam `context.params`.
`http.ts` centraliza o try/catch e as respostas via `NextResponse.json()`.

Exemplo de criação:

```json
{
  "codigo": "P001",
  "nome": "Produto exemplo",
  "id_tipo_produto": 1,
  "unidade": "UN",
  "controla_estoque": 1,
  "permite_compra": 1,
  "permite_producao": 0,
  "permite_venda": 1
}
```

Exemplos de erro:

```json
{ "success": false, "error": "Produto não encontrado." }
```

```json
{ "success": false, "error": "Já existe um produto com este código." }
```

```json
{ "success": false, "error": "Corpo da requisição deve conter JSON válido." }
```

Erros Zod retornam 400 com caminhos e detalhes na string `error`; FK inválida
retorna 400; código duplicado detectado na consulta retorna 409. Violações de
constraints UNIQUE (P2002), quando existentes no banco, também retornam 409. Erros
inesperados são registrados internamente e retornam apenas `Erro interno do servidor.`

Os testes foram centralizados em `tests/unit/produtos`:
`npm test -- tests/unit/produtos`.

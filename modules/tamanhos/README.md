# Tamanhos

Módulo conectado ao Prisma Client gerado em `src/generated/prisma` e à instância
existente de `src/lib/prisma.ts`. Não altera o schema ou a configuração do banco.

## Contrato

- `POST /api/tamanhos`: exige `id_empresa` e `nome`, retorna 201.
- `GET /api/tamanhos`: aceita `page` (1), `limit` (20, máximo 100), `id_empresa`,
  `status` e `nome`. O nome usa igualdade conforme a collation MySQL. Os filtros
  são combinados e a ordenação é `ordem`, `nome`, `id`, crescente.
- `GET /api/tamanhos/:id`: retorna o recurso ou 404.
- `PUT` ou `PATCH /api/tamanhos/:id`: atualização parcial, sem alterar `id`; um objeto vazio
  é inválido. Omitir `status` ou `ordem` preserva os valores existentes.
- `DELETE /api/tamanhos/:id`: altera status para `INATIVO`, com resposta 200.
  Repetir a operação é permitido.

Todas as rotas exigem `Authorization: Bearer <access_token>`, usuário, empresa e vínculo ativos, além da permissão da operação em `permissoes_usuario`. Sem token válido: 401; sem vínculo/permissão: 403. IDs fora do escopo retornam 404. O filtro `id_empresa` é opcional, mas somente empresas autorizadas entram na consulta. Veja [autorização dos catálogos](../catalogos/README.md).

Tamanhos usa a permissão `PRODUTOS`. `busca` pesquisa parcialmente em `nome` OU `descricao`, combinado aos demais filtros. Exemplo: `GET /api/tamanhos?page=2&limit=10&busca=medio&status=ATIVO`. O banco entrega somente a página atual e conta todos os resultados filtrados autorizados.

O schema real define `nome` com 50 caracteres, `descricao` com 255 e nullable,
`ordem` Int NOT NULL com default 0 e `status` com default `ATIVO`.
A ordem é opcional na criação, mas não aceita null; aceita o intervalo de Int
assinado do MySQL. Existe UNIQUE em `(id_empresa, nome)`, inclusive para inativos.

```json
{ "id_empresa": 10, "nome": "M", "descricao": "Médio", "ordem": 2 }
```

Resposta de listagem:

```json
{ "success": true, "data": { "rows": [], "count": 0, "page": 1, "limit": 20, "totalPages": 0 } }
```

Erros usam `{ "success": false, "error": "..." }`:

| HTTP | Exemplo |
| --- | --- |
| 400 | `Empresa inexistente.` ou detalhes dos campos inválidos |
| 404 | `Tamanho não encontrado.` |
| 409 | `Já existe um tamanho com este nome nesta empresa.` |
| 500 | `Erro interno do servidor.` (detalhes apenas no log) |

O repository concentra as operações Prisma; o service valida dados, aplica filtros
e traduz erros conhecidos. Os handlers usam os helpers comuns em
`lib/api`. A rota `[id]` é necessária para os endpoints por ID.

Testes: `npm test -- tests/unit/tamanhos`.

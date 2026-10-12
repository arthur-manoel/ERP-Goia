# Tipos de produto

O módulo usa `tipos_produto` do Prisma atual: `id`, `nome` único e `descricao`
opcional. Não há coluna de empresa ou status nesse schema.

As rotas exigem JWT válido e um vínculo ativo a uma empresa com autorização para
`PRODUTOS`: administrador global, vínculo de nível `EMPRESA`, ou permissão
explícita para a operação. Isso protege o acesso ao cadastro global sem confiar
no cabeçalho `X-Empresa-Id` enviado pelo cliente.

- `GET /api/tipos_produto?page=1&limit=20&nome=Insumo` retorna somente a página
  solicitada em `{ success, data: { rows, count, page, limit, totalPages } }`.
- `POST /api/tipos_produto` cria um tipo; `nome` é obrigatório e único.
- `GET /api/tipos_produto/:id` busca por ID.
- `PUT /api/tipos_produto/:id` substitui os campos; `nome` é obrigatório e a
  descrição omitida é limpa.
- `PATCH /api/tipos_produto/:id` atualiza somente os campos informados.
- `DELETE /api/tipos_produto/:id` retorna 409 quando houver produtos vinculados.
  Sem status no schema, essa regra protege o histórico; tipos sem vínculo são
  removidos fisicamente, pois não possuem histórico associado.

As rotas usam limite local por processo: 120 leituras/minuto e 30 escritas/minuto
por cliente. Ao exceder, retornam 429 com o envelope JSON padrão. Em ambiente com
múltiplas instâncias, a store deve ser substituída por Redis ou outro armazenamento
compartilhado.

Exemplos de erros: `400` para entrada inválida, `404` para ID inexistente, `409`
para nome duplicado ou tipo vinculado, e `429` para excesso de requisições.

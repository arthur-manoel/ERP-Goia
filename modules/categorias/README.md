# Categorias

Rotas: `GET/POST /api/categorias` e `GET/PUT/PATCH/DELETE /api/categorias/:id`.
Utilizam `catalogRequest`, JWT, vínculo ativo e permissão `CATEGORIAS` por operação,
com as mesmas exceções administrativas dos demais catálogos. As respostas JSON e
o tratamento de erros utilizam `NextResponse` pelo helper central do projeto.

`id_empresa` omitido na criação usa a única empresa autorizada. Havendo múltiplas,
retorna 400 solicitando seleção explícita. Não são criados registros globais.
Categorias legadas sem empresa não são expostas pelas rotas. Transferências
entre empresas autorizadas são permitidas apenas para categorias sem produtos
vinculados, preservando os vínculos históricos existentes.

Listagem: `page=1`, `limit=20` (máximo 100), `nome`, `busca`, `status`, `id_empresa`,
`ordenar_por=nome|id`, `ordem=asc|desc`. Exemplo:
`GET /api/categorias?page=2&limit=10&busca=tecido&status=ATIVA&ordenar_por=nome`.
O modelo Prisma atual não possui data de cadastro. Filtros, ordenação, contagem e
paginação são executados no banco. PUT exige nome e restaura descrição/status aos
padrões quando omitidos; PATCH preserva os demais campos.

Exemplo de criação:

```json
{ "nome": "Tecidos", "descricao": "Tecidos para produção", "id_empresa": 10 }
```

Nomes são normalizados removendo espaços externos e reduzindo espaços internos.
A checagem no banco ignora caixa e espaços excedentes, inclusive em registros
legados (utiliza `REGEXP_REPLACE`, disponível no MySQL 8+). Apenas categorias
ativas conflitam. Renomear/reativar também verifica duplicidade. DELETE conta os
produtos vinculados e inativa sem remover registros ou relacionamentos.

## Banco e implantação

Aplicar a migration `20261023000000_categorias_active_names` antes de liberar o
módulo. Ela substitui o índice único `(id_empresa, nome)`, que também bloqueava
duplicidades entre inativas, por um índice normal. A migration não foi executada
automaticamente. Seguir a política do projeto para alterar o MySQL e regenerar
o Prisma Client. Nenhuma linha histórica é removida.

A unicidade ativa é garantida pelas escritas deste módulo: criação, atualização e
inativação executam a checagem e gravação na mesma transação, bloqueando as linhas
das empresas autorizadas em ordem crescente (`FOR UPDATE`). Escritas externas
precisam seguir o mesmo protocolo; o índice normal não impõe essa regra sozinho.

Produtos também usam `modules/catalogos/transactions.ts` ao criar ou editar:
adquirir os bloqueios, validar categoria ativa na empresa dos vínculos reais e
gravar ocorre na mesma transação. Assim uma transferência não pode passar pela
contagem de produtos enquanto um novo vínculo estiver sendo gravado. Categoria
transferida antes da validação deixa de ser elegível para a empresa anterior.
O protocolo também coordena inativação e novas associações; vínculos históricos
podem continuar apontando para categorias que foram inativadas posteriormente.

Rate limit por usuário autenticado/processo: 120 leituras/minuto (lista e ID
compartilham contador), 30 escritas/minuto. O limitador existente é local à
instância; múltiplas instâncias exigem armazenamento compartilhado para um limite
global. Tokens inválidos não consomem esses contadores.

Erros exemplares: 400 "Informe id_empresa para selecionar a empresa da categoria.",
403 "Sem permissão para esta empresa.", 404 "Categoria não encontrada.",
409 "Já existe uma categoria ativa com este nome nesta empresa.".
Os testes unitários usam Prisma mockado; não substituem um teste de concorrência
com o MySQL real.

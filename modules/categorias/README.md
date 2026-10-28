# Categorias

Módulo de categorias de produtos: schemas Zod, repository Prisma, service e rotas
App Router, seguindo os demais módulos. Respostas e erros usam o helper comum
`handleRequest`/`NextResponse.json()` com `{ success, data?, error? }`.

## Endpoints e segurança

- GET/POST `/api/categorias`.
- GET/PUT/PATCH/DELETE `/api/categorias/:id`.
- JWT obrigatório; vínculo ativo com empresa ativa e permissão CATEGORIAS por
  ação (`pode_ler/criar/editar/excluir`). ADMIN global e nível EMPRESA seguem as
  exceções do autorizador atual, mantendo o vínculo ativo obrigatório.
- Header `X-Empresa-Id`, quando enviado, restringe a operação à empresa escolhida.
  Corpo/filtros de outra empresa retornam 403. ID inacessível retorna 404.
- Limite por usuário autenticado e processo: 120 leituras ou 30 escritas/minuto,
  compartilhado entre coleção e ID. Tokens inválidos não criam contadores.
  Para limite compartilhado entre instâncias é necessária uma store externa.

## Contrato e empresa opcional

```json
{ "id_empresa": 10, "nome": "Malha Lisa", "descricao": "Tecidos", "status": "ATIVA" }
```

Nome obrigatório, de 2 a 100 caracteres depois de normalizar espaços e Unicode
NFC. Descrição opcional/nula com até 255 caracteres. Status padrão ATIVA. Campos
extras e alteração de id são rejeitados. PUT exige nome e restaura descrição/status
omitidos aos padrões; PATCH é parcial, não vazio e não aplica defaults de criação.

`id_empresa` pode ser omitido na criação quando só houver uma empresa autorizada
ou quando o header selecionar uma. Com várias empresas e sem seleção, retornar
400 para evitar escolha arbitrária. Na atualização, omissão mantém a empresa atual.
Não são criadas categorias globais: registros legados com empresa nula ficam fora
do escopo destas APIs, preservando isolamento empresarial.

## Unicidade, inativação e vínculos

Não são aceitos nomes ativos duplicados na mesma empresa, ignorando caixa e
espaços excedentes. A consulta de legado normaliza o nome no SQL, parametrizado,
usando REGEXP_REPLACE (MySQL 8/MariaDB compatível). A empresa é bloqueada antes da
checagem e gravação, impedindo duas criações concorrentes pelas APIs.

O Prisma existente tem índice UNIQUE `(id_empresa, nome)` para todos os status.
Por isso o banco também pode rejeitar nomes iguais a categorias inativas; essa
restrição é preservada e traduzida para 409, sem renomear histórico nem modificar
o banco. Para reutilizar esse nome, reative a categoria existente.

DELETE muda status para INATIVA, conta produtos vinculados e permite inativar com
vínculos, preservando-os. Repetir DELETE é idempotente. PUT/PATCH que inativam
exigem também pode_excluir na origem e destino, além de pode_editar. Cadastro
já INATIVA também exige exclusão. Reativação verifica novamente unicidade ativa.

Transferência de empresa é permitida somente sem nenhum produto vinculado,
inclusive histórico/inativo. Criação/edição de produtos valida categoria ativa e
da mesma empresa e participa dos mesmos locks. Produtos compartilhados entre
empresas não podem receber categoria de apenas uma delas. Categoria inativa pode
continuar vinculada historicamente; novos vínculos são rejeitados.

## Consultas e erros

`page=1`, `limit=20`, máximo 100. Filtros `nome`, `status`, `id_empresa`, busca
textual `busca`. Ordenação `ordenar_por=nome|id`, `ordem=asc|desc`, com ID como
desempate. Não há data de cadastro no modelo atual. Prisma executa filtros,
ordenação, skip/take e count no banco, com linhas e total no mesmo snapshot.

```json
{ "success": true, "data": { "rows": [], "count": 0, "page": 1, "limit": 20, "totalPages": 0 } }
```

400 validação/relacionamentos; 401 token inválido; 403 empresa/permissão; 404 ID
inexistente/inacessível; 409 duplicidade, transferência vinculada ou concorrência;
429 limite; 500 erro genérico com log interno. Exemplos: `Já existe uma categoria
ativa com este nome nesta empresa.` e `Categoria com produtos vinculados não pode
ser transferida para outra empresa.`

## Transações e testes

Locks no MySQL/InnoDB: empresas autorizadas em ordem crescente, depois categoria.
Associações de produtos usam o mesmo protocolo. Leitura, validação e escrita
ocorrem no mesmo TransactionClient READ COMMITTED; conflitos retornam 409, sem
repetição automática. Outros escritores devem respeitar o mesmo protocolo.

Testes em `tests/unit/categorias` cobrem schemas, HTTP, permissões, unicidade,
paginação e ordens concorrentes simuladas de criação/transferência/associação.
Prisma é mockado; testes não substituem integração concorrente com MySQL real.
O schema atual foi reutilizado, sem migration ou alteração no banco.

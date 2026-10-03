# Fornecedores

Organização igual aos demais cadastros: `modules/fornecedores` contém schemas,
service e repository; `src/app/api/fornecedores` contém handlers da coleção e `[id]`.
Usa a instância Prisma existente e o tratamento JSON compartilhado de `src/lib/api`.

- POST na coleção cria com `id_empresa` e `razao_social` obrigatórios, status
  `ATIVO` por padrão e data de cadastro preenchida pelo banco. Retorna 201.
- GET na coleção aceita `page=1`, `limit=20` (máximo 100), `id_empresa`, `status`,
  `razao_social` e `nome_fantasia`. Filtros por igualdade são combinados com AND,
  conforme o padrão existente. Ordenação estável por razão social e ID.
  Retorna `{ success: true, data: { rows, count, page, limit, totalPages } }`.
- GET por ID retorna o recurso ou 404.
- PUT por ID aceita atualização parcial não vazia, sem `id` ou `data_cadastro`.
  Campos omitidos são preservados, incluindo status. Opcionais aceitam null.
- DELETE por ID altera somente status para `INATIVO`, preservando vínculos e
  histórico. Retorna 200 mesmo se já estiver inativo, ou 404 se não existir.

Os limites de texto seguem o schema Prisma atual. A API exige empresa na criação,
embora o banco aceite null para registros legados. Não altera schema ou tabelas.

## CNPJ e email

CNPJ aceita formato numérico ou alfanumérico, com ou sem máscara. O formato segue
a [documentação da Receita Federal](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/cnpj/cnpj-alfanumerico.pdf):
12 caracteres alfanuméricos e dois numéricos, 14 posições ao todo. A validação é
de formato, conforme solicitado; não calcula dígitos verificadores nem consulta
a situação cadastral. O valor é armazenado sem máscara, em maiúsculas.

A unicidade é por empresa, conforme `@@unique([id_empresa, cnpj])`. O service
verifica duplicatas na criação e nas alterações de CNPJ ou empresa, excluindo o
próprio ID e considerando também a máscara legada. CNPJ de fornecedor inativo
continua reservado. O banco protege gravações concorrentes com P2002; cadastros
feitos fora desta API também devem usar a forma canônica para preservar a mesma
equivalência de formatos. CNPJ omitido ou null não participa da checagem.

Email informado deve ter formato válido e até 150 caracteres. CNPJ/email vazios
são rejeitados; para limpar, envie null. Estado é normalizado para duas letras
maiúsculas.

```json
{
  "id_empresa": 10,
  "razao_social": "Fornecedor Exemplo Ltda",
  "nome_fantasia": "Exemplo",
  "cnpj": "11.222.333/0001-81",
  "email": "contato@example.com"
}
```

Erros seguem `{ success: false, error: "..." }`:

- 400: detalhes Zod, `Empresa inexistente.` ou tamanho excedido.
- 404: `Fornecedor não encontrado.`
- 409: `Já existe um fornecedor com este CNPJ nesta empresa.`
- 500: `Erro interno do servidor.`, com detalhes somente no log interno.

Testes: `npm test -- tests/unit/fornecedores`. O Prisma é simulado; não grava no banco.

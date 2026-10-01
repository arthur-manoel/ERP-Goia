# API de posições de estoque e relacionamento de produtos

Esta API consulta posições reais e vincula um produto já habilitado para a empresa
a um local e setor existentes. Usa a tabela `estoque`; criar o vínculo não representa
recebimento de mercadoria. A posição nova nasce com físico e reserva `0.000`.
Não há alteração de schema, movimentação, kardex ou mínimo decorrente desse cadastro.

## Endpoints e autenticação

| Método | Rota | Permissão ESTOQUE |
| --- | --- | --- |
| GET | `/api/estoque` | `pode_ler` |
| GET | `/api/estoque/{id}` | `pode_ler` |
| POST | `/api/estoque` | `pode_criar` |

Faça login em `POST /api/auth/login` com
`{ "email": "<EMAIL>", "password": "<SENHA>" }` e envie
`Authorization: Bearer <ACCESS_TOKEN>` e `X-Empresa-Id: <ID_EMPRESA>`.
O servidor revalida usuário, empresa, vínculo ativo e permissão em cada chamada.
O header seleciona a empresa; não concede acesso. Com um único vínculo ativo,
pode ser omitido; com mais de um, é obrigatório.
As exceções existentes de usuário global ADMIN ou vínculo EMPRESA continuam
exigindo vínculo ativo. Leitura, criação e edição são independentes.
Não usa sessão provisória nem `DEV_ID_*`.

Todas as respostas protegidas, incluindo erros, usam
`Cache-Control: private, no-store`. Não há PATCH de saldo nem DELETE de posição.

## Consultas

| Parâmetro GET da coleção | Padrão e regra |
| --- | --- |
| `id_produto` | Opcional; Int de 1 a 2147483647 |
| `id_local_estoque` | Opcional; Int de 1 a 2147483647 |
| `id_setor` | Opcional; Int de 1 a 2147483647 |
| `busca` | Opcional; trim, até 100 caracteres; vazio é ignorado |
| `incluir_zerados` | `true`; somente strings `true` ou `false` |
| `pagina` | `1`; inteiro de 1 a 2147483647 |
| `limite` | `25`; inteiro de 1 a 100 |

Filtros combinam por AND; busca literal por trecho do nome, código e código interno
da empresa combina por OR, conforme a collation do banco. Aspas, `%` e `_` não
alteram SQL nem funcionam como operadores. Parâmetros desconhecidos/repetidos,
`id_empresa`, frações, sinais, zeros à esquerda e notação exponencial são rejeitados.
POST e detalhe não aceitam parâmetros de query.

Ordenação fixa por ID da posição, crescente. Filtros, COUNT, LIMIT e OFFSET
executam no banco; COUNT e página compartilham um snapshot RepeatableRead,
sem bloquear saldo para escrita. São dois SELECTs da listagem, sem N+1.
`totalRegistros` representa todo o conjunto filtrado. Página além da última
retorna lista vazia e mantém os totais. Sem resultado, total e páginas são zero.

As relações com local, setor e produto/empresa são filtradas pela empresa autorizada.
Filtros para recursos alheios e inexistentes produzem o mesmo resultado vazio.
Detalhe alheio, inexistente ou com relação inconsistente retorna o mesmo 404.
Posições existentes com cadastros inativos continuam visíveis com seus status.
Produto sem posição não gera linha fictícia. `incluir_zerados=false` exclui apenas
saldo físico zero, preservando valores negativos existentes.

Exemplo ilustrativo da coleção:

```json
{
  "dados": [{
    "idEstoque": 100,
    "produto": {
      "id": 25, "codigo": "CAM-001", "codigoInterno": null,
      "nome": "Camiseta", "unidade": "UN", "status": "ATIVO", "statusNaEmpresa": "ATIVO"
    },
    "localEstoque": { "id": 10, "nome": "Loja Centro", "status": "ATIVO" },
    "setor": { "id": 3, "nome": "Estoque da loja", "status": "ATIVO" },
    "quantidadeFisica": "12.000", "quantidadeReservada": "2.000",
    "quantidadeDisponivel": "10.000", "atualizadoEm": "2026-09-27T12:00:00.000Z"
  }],
  "paginacao": { "pagina": 1, "limite": 25, "totalRegistros": 1, "totalPaginas": 1 }
}
```

O detalhe retorna diretamente um item desse array. Quantidades vêm de
`estoque.quantidade` e `quantidade_reservada`; disponível é físico menos reservado,
calculado em DECIMAL e serializado com três casas, sem conversão para float.
Disponível é informativo, não garante reserva. Não se somam movimentações, reservas
operacionais ou kardex ao saldo. `atualizadoEm` é a data real registrada na origem.
Não são expostos preços, custos ou fornecedores.

## Criação, idempotência e concorrência

POST recebe somente três IDs numéricos inteiros positivos:

```json
{ "idProduto": 25, "idLocalEstoque": 10, "idSetor": 3 }
```

Empresa e usuário vêm da autorização. Campos de quantidade, reserva, mínimo,
empresa ou usuário no corpo são inválidos. Para uma posição nova, produto e
habilitação precisam estar ativos, com `controla_estoque=true`; local e setor
precisam pertencer à empresa e estar ativos. Não são criados cadastros auxiliares.

| Situação | Resultado |
| --- | --- |
| Vínculo novo válido | 201 e `criado: true` |
| Mesma empresa/local/produto/setor existente | 200 e `criado: false` |
| Mesmo local/produto com outro setor | 409 |
| Mesmo setor/produto em outro local | 409 |
| Produto não habilitado, local ou setor fora do escopo/inexistente | 404 genérico |
| Novo vínculo com cadastro inativo ou sem controle de estoque | 409 |

Confirmação de criação:

```json
{ "idEstoque": 100, "idProduto": 25, "idLocalEstoque": 10, "idSetor": 3, "criado": true }
```

A confirmação não contém saldos ou nomes; permissão de criação não concede leitura.
Repetição preserva saldo, reserva, setor, data e auditoria existentes, inclusive
se o cadastro foi inativado depois. Não é operação de reativação.

O banco possui duas chaves únicas: empresa/local/produto e empresa/setor/produto.
Ambas são preservadas. Local e setor são entidades diferentes e obrigatórias.
Criação e auditoria INSERT usam a mesma transação Serializable. Falha na auditoria
reverte a posição. Disputas de unicidade/deadlock são tratadas com até cinco
tentativas em transações novas; o vencedor é consultado novamente. Se a disputa
persistir, retorna 409 e o consumidor pode repetir o mesmo POST.

Configurações `estoque_minimo_local` existentes permanecem intactas; mínimos
ausentes continuam ausentes. A posição criada é consultável pelo relatório
existente, com seus filtros. O alerta mínimo mantém a comparação físico <= mínimo.

Erros usam `{ "error": "mensagem" }`: 400 para JSON/filtros/ID inválidos ou seleção
obrigatória ausente; 401 para autenticação inválida; 403 para empresa/permissão
negada; 404 para recurso fora do escopo; 409 para conflito/estado; 500 genérico
para falha inesperada, sem SQL, token, credenciais ou stack.

```bash
curl 'http://localhost:3000/api/estoque?id_produto=25&pagina=1&limite=25' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' -H 'X-Empresa-Id: <ID_EMPRESA>'
curl 'http://localhost:3000/api/estoque' -X POST \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' -H 'X-Empresa-Id: <ID_EMPRESA>' \
  -H 'Content-Type: application/json' \
  --data '{"idProduto":25,"idLocalEstoque":10,"idSetor":3}'
```

## Testes locais

Use Node 24 e um MySQL/MariaDB local vazio e dedicado. Crie o banco
`erp_goia_api_estoque_produtos_test`. Configure somente URLs locais de teste,
sem credenciais versionadas. O runner exige host local, sufixo `_test` e ausência
de dados em todos os models; não lê `.env`, não aplica DDL e não usa banco remoto.
Aplica-se previamente o baseline e as migrations de refresh token e estoque mínimo
já versionadas. Confira `.env.local` e a URL mostrada pelo Prisma antes das migrations.

```powershell
$env:ESTOQUE_API_TEST_DATABASE_URL='mysql://<USER>:<PASSWORD>@127.0.0.1:3306/erp_goia_api_estoque_produtos_test'
$env:DATABASE_URL=$env:ESTOQUE_API_TEST_DATABASE_URL
npm ci
npx prisma migrate deploy
npm run db:validate
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
node --test tests/estoque-api.integration.test.mjs
```

O runner inicia o build com NODE_ENV=production em loopback/porta livre, faz login
real, cria fixtures próprias e remove somente seus dados. Ausência da URL é falha,
não teste ignorado. Não execute runners que limpem o mesmo banco simultaneamente.
Para regressões, configure separadamente `ESTOQUE_MINIMO_TEST_DATABASE_URL`
(`ESTOQUE_MINIMO_TEST_HTTP=1` para HTTP), `ESTOQUE_RELATORIO_TEST_DATABASE_URL`
e `AUTH_TEST_DATABASE_URL`, seguindo os requisitos de cada teste existente.

Testes de contrato e falhas inesperadas usam doubles somente nos unitários;
persistência, duas unicidades, concorrência, rollback e compatibilidade são
verificados também contra banco real e HTTP. A aplicação não depende desses doubles.

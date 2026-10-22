# Relatório de quantidade de produtos por estoque

`GET /api/relatorios/estoque/produtos` consulta os saldos atuais persistidos.
Entrega exclusivamente de back-end: sem telas, exportação, posição histórica,
alteração de saldo ou nova tabela/migration.

## Autenticação e autorização

Faça login em `POST /api/auth/login` com `{ "email": "<EMAIL>", "password": "<SENHA>" }`.
Envie `Authorization: Bearer <accessToken>` e `X-Empresa-Id: <ID_EMPRESA>`.
O header seleciona a empresa; não concede acesso. A API reutiliza
`autorizarEstoque(request, "ler")`, já utilizado pelo estoque mínimo:

- JWT válido com perfil reconhecido pelo backend;
- usuário, empresa e vínculo ativos;
- `permissoes_usuario.recurso = ESTOQUE` e `pode_ler = true`;
- exceções existentes: vínculo com nível `EMPRESA` ou usuário global `ADMIN`,
  sempre com vínculo ativo na empresa selecionada.

Com exatamente um vínculo ativo, o autorizador permite omitir o header.
Com mais de um, exige a seleção. Não usa sessão provisória nem `DEV_ID_*`.
`id_empresa` na query é rejeitado. IDs de produto/local alheios e IDs inexistentes
produzem o mesmo resultado vazio, sem consulta global que revele sua existência.

## Parâmetros

| Parâmetro | Padrão e regra |
| --- | --- |
| `id_local_estoque` | Opcional; inteiro de 1 a 2147483647 |
| `id_produto` | Opcional; inteiro de 1 a 2147483647 |
| `busca` | Opcional; trim, máximo 100 caracteres; vazio é ignorado |
| `incluir_zerados` | `true`; somente as strings `true` ou `false` |
| `pagina` | `1`; inteiro de 1 a 2147483647 |
| `limite` | `25`; inteiro de 1 a 100 |
| `ordenar_por` | `local`; aceita `local`, `produto`, `quantidade_fisica` |
| `direcao` | `asc`; aceita `asc` ou `desc` |

Parâmetros desconhecidos ou repetidos são inválidos. Números não aceitam sinal,
frações ou notação exponencial. O deslocamento máximo permanece inteiro seguro.
Os filtros combinam por AND. A busca é por trecho literal do nome, código ou
código interno da empresa (OR), respeitando a collation do banco. `%`, `_`,
aspas e barras não são operadores de busca nem SQL.

A ordenação principal é pelo nome do local, nome do produto ou saldo físico.
O desempate é sempre crescente por ID do local, produto e registro de estoque.
Páginas além da última são vazias, com os totais reais mantidos.

## Significado dos dados

Cada linha representa empresa autorizada + local + produto. O schema possui
unicidade nessa combinação e também em empresa + setor + produto. Local e setor
são obrigatórios (Int); não há saldo legitimamente sem local neste schema.
Não há saldo por cor/tamanho nessa tabela, portanto não se junta variações.

- Física: `estoque.quantidade`.
- Reservada: `estoque.quantidade_reservada` registrada nessa mesma posição.
- Disponível: física menos reservada; campo derivado, não uma garantia de reserva.
- `atualizadoEm`: `estoque.data_atualizacao`, sem fabricar atualização.
- `geradoEm`: instante de geração da consulta.

Não se recalcula a reserva pela tabela `reserva_estoque`, nem se somam movimentos
ou kardex ao saldo. Valores negativos e reserva superior ao físico são preservados.
As quantidades são calculadas com DECIMAL/Prisma.Decimal e retornam strings com
três casas. IDs e contagens são números; os IDs atuais são Int.

Saldo zero existente aparece por padrão. `incluir_zerados=false` exclui apenas
física igual a zero, não negativos. Produto sem linha de estoque não aparece.
Produtos, vínculos produto/empresa e locais inativos com saldo continuam visíveis;
os três status são retornados. `controla_estoque=false` não apaga saldo existente.
Como no módulo de estoque, exige-se vínculo do produto com a empresa. Relações
inconsistentes com local ou setor de outra empresa não são expostas.

Contagens e resumo consideram todo o conjunto filtrado, antes da paginação:

- `totalRegistros`: combinações local/produto;
- `totalProdutosDistintos`: produtos distintos, mesmo quando presentes em vários locais;
- `totalLocais`: locais representados;
- `porLocalEUnidade`: somas por local e código exato da unidade, sem conversão.

Inclusive `M` e `m` permanecem separados. Não existe total somando unidades diferentes.
São três SELECTs parametrizados, sem consultas por item: contagem, página e grupos.
Executam em uma transação de leitura `RepeatableRead`, para um único snapshot
InnoDB, sem `FOR UPDATE`. Filtros, agregações e paginação executam no banco.
Reutilizam os índices existentes; buscas por trecho e agregações podem varrer o
conjunto filtrado. O resumo contém todos os grupos, mesmo com página pequena.

## Resposta e erros

Exemplo ilustrativo (não é dado fixo do endpoint):

```json
{
  "geradoEm": "2026-09-26T15:00:00.000Z",
  "dados": [{
    "localEstoque": { "id": 10, "nome": "Depósito", "status": "ATIVO" },
    "produto": {
      "id": 25, "codigo": "TEC-001", "codigoInterno": null,
      "nome": "Tecido", "unidade": "M", "status": "ATIVO", "statusNaEmpresa": "ATIVO"
    },
    "quantidadeFisica": "150.500", "quantidadeReservada": "20.000",
    "quantidadeDisponivel": "130.500", "atualizadoEm": "2026-09-26T14:30:00.000Z"
  }],
  "paginacao": { "pagina": 1, "limite": 25, "totalRegistros": 1, "totalPaginas": 1 },
  "resumo": {
    "totalProdutosDistintos": 1, "totalLocais": 1,
    "porLocalEUnidade": [{
      "idLocalEstoque": 10, "unidade": "M", "quantidadeFisica": "150.500",
      "quantidadeReservada": "20.000", "quantidadeDisponivel": "130.500"
    }]
  }
}
```

Sem resultados: `200`, `dados: []`, contagens e total de páginas zero,
`porLocalEUnidade: []`. Erros usam `{ "error": "mensagem" }`:
400 para filtros inválidos/seleção obrigatória ausente, 401 para JWT ausente ou
inválido, 403 para empresa/permissão negada e 500 genérico para falhas inesperadas.
Sucesso e erros usam `Cache-Control: private, no-store`.

```bash
curl 'http://localhost:3000/api/relatorios/estoque/produtos?id_local_estoque=10&pagina=1&limite=25&incluir_zerados=true' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'X-Empresa-Id: <ID_EMPRESA>'
```

## Testes locais

Use Node 24 (conforme `.nvmrc`) e MySQL/MariaDB local separado. Crie um banco
**vazio**, dedicado, cujo nome termine em `_test`, por exemplo
`erp_goia_relatorio_estoque_test`. Não use banco compartilhado nem uma cópia com
dados reais. Os testes de integração não leem `.env`, não aplicam DDL e recusam
host não local, nome sem sufixo de teste ou dados de negócio preexistentes.

No PowerShell, na raiz desta cópia:

```powershell
$env:ESTOQUE_RELATORIO_TEST_DATABASE_URL='mysql://<USER>:<PASSWORD>@127.0.0.1:3306/erp_goia_relatorio_estoque_test'
$env:DATABASE_URL=$env:ESTOQUE_RELATORIO_TEST_DATABASE_URL
npm ci
npx prisma migrate deploy
npm run db:validate
npm test
npm run build
node --test tests/relatorio-estoque.integration.test.mjs
```

Revise `.env.local` antes de preparar o banco: o Prisma carrega o ambiente do
projeto. Confirme host e nome mostrados pelo comando. A configuração bloqueia
migrations remotas. As migrations já versionadas incluem baseline, refresh token
e estoque mínimo local; esta entrega não acrescenta migration.

O runner usa explicitamente a URL de teste, cria fixtures próprias, inicia o
build com `NODE_ENV=production` em porta local livre, faz login real e requisições
HTTP autenticadas. Ao terminar, encerra o processo e remove somente os IDs criados.
Ausência da URL causa falha, não teste silenciosamente ignorado. Não execute dois
runners sobre o mesmo banco simultaneamente.

A suíte cobre filtros/contrato, precisão, status, isolamento, relações cruzadas,
240 produtos adicionais, paginação nas seis ordenações, totais completos e ausência
de escritas. O schema atual não tem tabelas de contas a pagar/receber; a verificação
de imutabilidade abrange estoque, vínculos, reservas, movimentos, kardex, compras,
vendas e notas fiscais. A falha de banco e a quantidade fixa de consultas são
também verificadas nos testes unitários. Teste com banco real não é executado pelo
CI atual, que não disponibiliza MySQL; execute-o localmente antes de publicar.

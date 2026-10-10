# API de pedidos comerciais e itens por variação

Back-end persistido em `pedido_cliente` e `pedido_cliente_item`, conforme a
modelagem incorporada pela PR #69. Não é `pedido_compra`, nem um cadastro paralelo.
O fluxo atual é pedido → venda → contas a receber. Este card implementa somente
rascunhos e consultas; não cria venda, cobrança, reserva, movimentação ou produção.
O front-end e seu adaptador temporário permanecem inalterados.

## Banco e implantação DB-first

Proposta mínima: `prisma/ddl/pedidos-itens-variacoes.sql`. Requer as tabelas de
pedidos da PR #69 já existentes. Acrescenta versão, chave/hash de idempotência,
FK nullable de variação, índice produto/variação e recurso de permissão `PEDIDOS`.
Não cria novas tabelas, não concede permissões automaticamente, não converte
pedidos antigos nem infere variações. Mínimos, estoque e tabelas financeiras
permanecem intactos. O schema incorpora os campos introspectados no banco local.

Antes de implantar: aprovação da equipe pelo processo DB-first, backup, aplicação
do SQL pelo responsável pelo banco e geração do Prisma Client. DDL MySQL tem
commit implícito: verificar pré-requisitos e executar em janela apropriada.
Não aplicar baseline/migrations de testes em banco existente compartilhado.
O SQL entregue não confirma implantação no banco compartilhado.

Itens legados conservam `id_variacao=NULL`, descrições, cores/tamanhos e valores.
O índice nullable preserva inclusive duplicidades antigas; não saneia dados por
conta própria. Para novos itens sem variação, a unicidade é garantida por lock do
cabeçalho `FOR UPDATE` + verificação `IS NULL` dentro da mesma transação. Todos os
escritores devem seguir esse protocolo; o índice sozinho não protege NULL no MySQL.
Itens legados com grade precisam de seleção explícita de variação válida para
serem editados; continuam disponíveis para consulta sem inventar referências.

## Autenticação, empresa e permissões

Login real: `POST /api/auth/login` com `{ "email": "<EMAIL>", "password": "<SENHA>" }`.
Envie `Authorization: Bearer <ACCESS_TOKEN>` e `X-Empresa-Id: <ID_EMPRESA>`.
O header só seleciona um vínculo autorizado. Usuário, empresa e vínculo precisam
estar ativos. Com um único vínculo ativo, o header pode ser omitido; com vários,
é obrigatório. Perfis aceitos: ADMINISTRACAO e VENDAS. ADMIN global ou vínculo
EMPRESA conserva a exceção existente, mas nunca dispensa vínculo ativo.
Não usa `DEV_ID_*` nem autoriza pedidos pelas permissões de cadastros/estoque.

| Método/rota | Permissão de PEDIDOS |
| --- | --- |
| GET `/api/pedidos` | pode_ler |
| GET `/api/pedidos/{id}` | pode_ler |
| POST `/api/pedidos` | pode_criar |
| PATCH `/api/pedidos/{id}` | pode_editar |
| POST `/api/pedidos/{id}/itens` | pode_editar |
| PATCH `/api/pedidos/{id}/itens/{idItem}` | pode_editar |
| DELETE `/api/pedidos/{id}/itens/{idItem}` | pode_editar e pode_excluir |

Não há DELETE de pedido ou PATCH livre de status. Mutações retornam somente
confirmação/IDs/versão; não concedem leitura implícita de todo o agregado.
Respostas protegidas e erros usam `Cache-Control: private, no-store`.

## Criação e idempotência

POST exige `Content-Type: application/json` e `Idempotency-Key: <CHAVE_UNICA>`.
A chave tem 8–128 caracteres ASCII alfanuméricos ou `._:-`, iniciando alfanumérico,
com comparação case-sensitive. Escopo é empresa; repetição exige o mesmo autor e
conteúdo normalizado. Mesma chave/conteúdo retorna 200/`criado:false`, sem pedido,
número ou auditoria extra. Conteúdo diferente ou outro autor retorna 409.
A proteção permanece no banco, inclusive depois de edições ou inativação de
cadastros. Uma requisição diferente deve usar outra chave; timeout pode repetir
a mesma. A ordem das linhas faz parte do conteúdo. Não há expiração automática.

```json
{
  "idCliente": 12,
  "dataEntregaPrevista": "2026-11-15",
  "itens": [
    { "idProduto": 25, "idVariacao": 80, "quantidade": "3.000", "precoPraticado": "49.90" },
    { "idProduto": 25, "idVariacao": 81, "quantidade": "2.000", "precoPraticado": "54.90" }
  ]
}
```

Exemplo ilustrativo, não fixture da aplicação. `observacao` é opcional/null, até
2000 caracteres. Cliente precisa estar ativo na empresa. Produto deve estar ativo,
habilitado para venda e com `produto_empresa` ativo. Variação ativa deve pertencer
ao produto e à empresa; sua cor/tamanho precisam estar ativos e no escopo. Cores
globais existentes (`id_empresa=NULL`) seguem o catálogo atual.

Grade é identificada por cor/tamanho em `produto_empresa` ou nas variações da
empresa, inclusive inativas. Grade exige variação. Produto legitimamente sem
grade aceita ausência/null, jamais FK fictícia zero. Mesma combinação é rejeitada,
mesmo com outro preço; combinações diferentes do mesmo produto são permitidas.
Até 100 itens na criação e no pedido; corpo JSON máximo 64 KiB. Edição não apaga
automaticamente itens de pedidos legados maiores que esse limite.

Empresa, usuário, número, status e datas internas vêm do servidor. Total,
subtotal, descontos, frete, empresa/usuário, status, número ou campos desconhecidos
no JSON são rejeitados. Preço é explícito: não há fallback silencioso ao catálogo.
Preço negociado é preservado; não foi criada uma política de descontos/taxas.
Preço não negativo (zero permitido); quantidade estritamente positiva.

## Cálculo e datas

Quantidade: string até 12 dígitos inteiros e 3 decimais; preço: até 13 inteiros e
2 decimais. Precisão excedente, sinais, vírgulas, expoentes e zeros à esquerda são
rejeitados. Multiplicação/soma usam Decimal, nunca float. Cada subtotal usa
HALF_UP para duas casas e os subtotais arredondados são somados. Exemplo acima:
149.70 + 109.80 = 259.50. Overflow de item ou agregado é conflito e reverte a escrita.

Novos ajustes são zero. Ajustes já persistidos em legados são preservados e
reaplicados segundo o guia atual: linha = quantidade × preço − desconto + acréscimo;
total = soma das linhas − desconto geral + frete + acréscimo geral. Alteração
incompatível com esses valores é rejeitada, não truncada nem corrigida em GET.
Código/descrição/unidade e preço do item são históricos; mudar catálogo não
reescreve pedidos. Edição só de quantidade/preço mantém o snapshot do produto.

`dataEntregaPrevista` é data civil obrigatória na criação: YYYY-MM-DD válido,
anos 1000–9999. Usa `data_previsao_entrega` existente, persistida à meia-noite UTC
e retornada como data civil, sem deslocamento por fuso. Não é entrega efetiva,
fechamento ou vencimento; `venda.data_entrega` não foi reaproveitada.

## Consultas, edições e concorrência

GET coleção: `idCliente`, `status`, `busca` (número/nome do cliente, até 100),
`dataInicio`/`dataFim` (data do pedido, inclusivas), `pagina` (1), `limite` (25,
máximo 100). IDs/páginas positivos até 2147483647. Parâmetros desconhecidos ou
repetidos recebidos pelo handler são inválidos. O Next instalado remove a chave
reservada `__proto__` da URL antes do handler; ela resulta na mesma consulta
autorizada sem esse parâmetro, nunca em filtro/empresa adicional. Esse comportamento
de transporte é testado em HTTP e não foi criada uma alteração global do framework.
Filtros combinam AND; busca literal OR. Lista vazia é 200.
Filtros e paginação executam no banco, ordenando data do pedido/ID decrescentes;
contagem e página compartilham snapshot RepeatableRead. Resposta:
`{ dados: [...], paginacao: { pagina, limite, totalRegistros, totalPaginas } }`.
Status usa o enum `pedido_cliente_status`, não `venda_status` ou rótulos de tela.
GET detalhe retorna pedido, totais e itens com quantidades/dinheiro em strings.
Legados/inativos permanecem consultáveis no escopo; GET não altera saldos/datas.
Recurso ausente ou de outra empresa recebe o mesmo 404, inclusive item alheio.

Para qualquer mutação de rascunho, envie `If-Match: "<VERSAO_CONSULTADA>"`.
GET detalhe/confirmacões retornam `versao` e ETag `"<VERSAO>"`. Versão antiga,
estado não RASCUNHO ou operação vinculada a venda/produção/entrega resulta 409.
Toda mutação revalida o cliente ativo na empresa; consulta e repetição idempotente
de uma criação já concluída não reescrevem registros após inativação do cliente.
Lock é no banco, entre processos. Cada sucesso incrementa a versão. Não há
repetição automática de edição que perdeu disputa; consulte antes de tentar de novo.
Criação pode repetir transações após rollback de deadlock/unicidade, até 5 tentativas.

PATCH cabeçalho aceita somente `idCliente`, `dataEntregaPrevista`, `observacao`.
Troca de cliente em legado com endereço/condição vinculados exige revisão e é
bloqueada. PATCH item aceita campos de referência, quantidade e preço, parciais;
troca de produto/variação deve resultar numa combinação válida. Inclusão/edição/
remoção recalculam total e auditam antes do mesmo commit. Remover último item é 409.
Falha de item/auditoria reverte cabeçalho, itens, total, versão e sequência.

O histórico `GET /api/clientes/{id}/pedidos` permanece compatível e consultando
`venda`, sem misturar IDs/status das entidades. Para encomendas novas, use
`GET /api/pedidos?idCliente=<ID>`. Não cria uma venda artificial só para esse histórico.

Erros: `{ "error": "mensagem" }`; 400 entrada inválida, 401 JWT inválido, 403
empresa/permissão negada, 404 ausência no escopo, 409 estado/disputa/limite, 500
genérico. Logs não incluem SQL, stack, token, senha ou corpo sensível.

## Testes locais reproduzíveis

Node 24, dependências instaladas e MySQL/MariaDB local dedicado. Crie dois bancos
vazios com sufixo `_test`, sem dados reais. Configure variáveis com placeholders;
nenhuma credencial é versionada. Não execute runners simultaneamente no mesmo banco.
As migrations antigas sozinhas não incluem as tabelas da PR #69. O preparador
usa o schema do commit-base oficial para criar a estrutura local do zero e depois
o SQL mínimo deste card; recusa bancos que já possuem tabelas e qualquer host remoto.
`--legado` prepara somente a estrutura anterior, para o teste de atualização.

```powershell
$env:PEDIDOS_TEST_DATABASE_URL='mysql://<USER>:<SENHA>@127.0.0.1:3306/erp_goia_pedidos_test'
$env:PEDIDOS_UPGRADE_TEST_DATABASE_URL='mysql://<USER>:<SENHA>@127.0.0.1:3306/erp_goia_pedidos_upgrade_test'
$env:DATABASE_URL=$env:PEDIDOS_TEST_DATABASE_URL
npm ci
node scripts/preparar-pedidos-test.mjs
node scripts/preparar-pedidos-test.mjs --legado
npm run db:generate
npm run db:validate
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
node --test tests/pedidos.integration.test.mjs
node --test tests/pedidos-banco.integration.test.mjs
```

HTTP roda o build real em produção, faz login real, cria fixtures próprias e remove
somente essas fixtures. Ausência de configuração falha, não ignora testes. O teste
de transição aplica o SQL só no banco local anterior vazio com suas fixtures;
não deve ser repetido sobre a estrutura já atualizada. Use outro banco vazio.
Foi preservada a API de clientes; a classificação técnica de concorrência é
compartilhada para que o retorno MariaDB 1020, presente também na base original,
continue correspondendo ao conflito 409 previsto, sem modificar regras do cadastro.
Mocks existem apenas nos unitários. Concorrência, FK, auditoria e rollback usam
banco real, além dos testes do caminho HTTP autenticado.

```bash
curl 'http://localhost:3000/api/pedidos?idCliente=<ID_CLIENTE>' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' -H 'X-Empresa-Id: <ID_EMPRESA>'
```

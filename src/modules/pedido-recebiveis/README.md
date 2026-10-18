# Fechamento do pedido e contas a receber

Entrega exclusivamente de back-end. Reutiliza pedidos/itens persistidos e o
financeiro existente: `pedido_cliente` → `venda` → `contas_receber`. Cada parcela
é um título independente; não há um segundo cadastro de cliente ou pedido.
O front-end e seu adaptador temporário não foram conectados por esta entrega.

## Evento comercial e elegibilidade

A decisão comercial aprovada é fechar somente depois do recebimento físico
completo confirmado pelo cliente. O gatilho explícito é
`POST /api/pedidos/{id}/fechar`, não o PATCH de status ou a criação do pedido.

O pedido precisa estar em `ENTREGUE` ou `CONCLUIDO`, ter itens e total positivo.
Toda remessa não cancelada precisa estar em `RECEBIMENTO_CONFIRMADO`, com data
de confirmação, recebedor e itens válidos. As quantidades confirmadas precisam
ser exatamente as quantidades de todas as linhas do pedido, sem falta ou excesso.
Remessas canceladas são ignoradas; remessas ativas ainda não confirmadas impedem
o fechamento. Um status isolado não comprova recebimento nem geração financeira.

O fechamento registra `pedido_cliente_fechamento.data_fechamento` e incrementa
a versão do pedido, preservando seu status operacional. Não acrescenta um status
`FECHADO`, não conclui logística nem cria entregas. A venda é criada com status
operacional `ENTREGUE` e financeiro `FATURADA`: neste fluxo isso significa títulos
emitidos, não nota fiscal emitida ou dinheiro recebido. `venda.data_entrega` usa
as datas reais de entrega das remessas, ficando nula se alguma não for conhecida;
não confunde confirmação do recebimento com data da entrega física.

Não gera pagamentos, baixa, movimentação financeira, reserva, estoque, produção,
cancelamento, estorno, notificação ou regularização retroativa.

## Autenticação e permissões

Faça login em `POST /api/auth/login` e envie `Authorization: Bearer <ACCESS_TOKEN>`
e `X-Empresa-Id: <ID_EMPRESA>`. O header seleciona uma empresa autorizada; nunca
concede acesso. Usuário, empresa e vínculo precisam estar ativos. Com apenas um
vínculo ativo, o header pode ser omitido; com vários, é obrigatório.
Não utiliza `getSessao()` nem `DEV_ID_*`.

| Operação | Perfil JWT | Recurso e permissão |
| --- | --- | --- |
| POST `/api/pedidos/{id}/fechar` | ADMINISTRACAO ou VENDAS | PEDIDOS, `pode_editar` |
| GET `/api/pedidos/{id}/conta-a-receber` | ADMINISTRACAO ou FINANCEIRO | FINANCEIRO, `pode_ler` |

A exceção administrativa existente para usuário ADMIN ou vínculo EMPRESA é
preservada, sempre após verificar o perfil aceito e o vínculo ativo. Permissões
de CLIENTES/ESTOQUE não autorizam financeiro. A geração decorrente do fechamento
não concede leitura financeira ao vendedor nem edição manual de títulos.

## Contrato de fechamento

Envie `Content-Type: application/json` e `If-Match: "<VERSAO_CONSULTADA>"`, com
aspas no valor do header. IDs são inteiros positivos até 2147483647. Corpo máximo
64 KiB, JSON UTF-8, somente estes campos:

```json
{
  "idCategoriaFinanceira": 8,
  "vencimentos": ["2026-11-10", "2026-12-10", "2027-01-10"]
}
```

Exemplo ilustrativo: substitua pelos IDs e datas acordados no ambiente. A
categoria deve pertencer à empresa, estar ativa e ser RECEITA ou AMBOS.
Não aceita total, saldo, valor de parcela, empresa, cliente, status ou campos
desconhecidos; também não aceita parâmetros na URL.

`vencimentos` contém de 1 a 120 datas civis `YYYY-MM-DD` válidas, anos 1000–9999.
Sua quantidade define o número de parcelas; sua ordem define a numeração.
Não ordena, não inventa um prazo de 30 dias e não deriva datas da entrega.
Sem condição persistida que imponha outra regra, não exige datas futuras ou
ordem cronológica, e permite datas iguais. As datas permanecem no mesmo dia civil
na persistência e na resposta, independentemente do fuso do servidor.

Se o pedido possuir `id_condicao_pagamento`, a condição precisa estar ativa na
mesma empresa. O número de vencimentos deve corresponder ao número de parcelas,
a permissão de parcelamento deve permitir a divisão e, se o intervalo em dias
for positivo, a diferença entre cada par de vencimentos consecutivos deve ser
exatamente esse intervalo. Não reaplica desconto percentual do cadastro sobre
o preço já negociado. O plano e os metadados da condição são congelados no evento.

Sucesso novo: 201, `gerado:true`. Repetição íntegra do mesmo plano: 200,
`gerado:false`. Ambos retornam somente seis campos, sem valores ou parcelas:

```json
{
  "idPedido": 12,
  "idFechamento": 4,
  "idVenda": 21,
  "versao": 3,
  "fechadoEm": "2026-10-17T12:00:00.000Z",
  "gerado": true
}
```

O header ETag contém a versão entre aspas. `If-Match` continua obrigatório em
repetições; após comprovar um fechamento íntegro com o mesmo plano, a repetição
pode usar a versão original sem criar nova operação. Para um fechamento novo,
versão divergente gera 409.

## Consulta financeira

`GET /api/pedidos/{id}/conta-a-receber` exige autorização financeira separada e
não aceita parâmetros na URL. Resposta 200:

```json
{
  "idPedido": 12,
  "idFechamento": 4,
  "idVenda": 21,
  "idCliente": 7,
  "fechadoEm": "2026-10-17T12:00:00.000Z",
  "total": "100.00",
  "totalParcelas": 3,
  "idCategoriaFinanceira": 8,
  "vencimentos": ["2026-11-10", "2026-12-10", "2027-01-10"],
  "parcelas": [
    { "idContaReceber": 31, "numeroParcela": 1, "totalParcelas": 3, "vencimento": "2026-11-10", "valorOriginal": "33.33", "saldo": "33.33", "situacao": "ABERTO" },
    { "idContaReceber": 32, "numeroParcela": 2, "totalParcelas": 3, "vencimento": "2026-12-10", "valorOriginal": "33.33", "saldo": "33.33", "situacao": "ABERTO" },
    { "idContaReceber": 33, "numeroParcela": 3, "totalParcelas": 3, "vencimento": "2027-01-10", "valorOriginal": "33.34", "saldo": "33.34", "situacao": "ABERTO" }
  ]
}
```

Dinheiro é string decimal com duas casas. A consulta não cria nem corrige dados.
Não expõe snapshots ou hashes internos. Respostas e erros usam
`Cache-Control: private, no-store`. Erros são `{ "error": "mensagem" }`: 400
entrada/plano inválido, 401 autenticação, 403 autorização, 404 ausente ou de outra
empresa, 409 estado/disputa/inconsistência e 500 genérico. Logs não expõem SQL,
token, credenciais ou corpo sensível.

## Cálculo, transação e repetição

A transação recalcula o pedido com as mesmas funções Decimal da API de pedidos,
usando quantidades, preços praticados e ajustes persistidos, nunca o preço atual
do catálogo. Primeiro fechamento pode registrar totais recalculados; um
fechamento já realizado nunca é recalculado e regravado silenciosamente.

O total é dividido em centavos inteiros. As primeiras N−1 parcelas recebem a
parte inteira; o resíduo fica na última. Assim, 100.00 / 3 resulta em 33.33,
33.33 e 33.34. Todas devem ser positivas e a soma deve ser exatamente o total.
Divisão que gere parcela zero é rejeitada. Cada título inicia `ABERTO`, com saldo
e valor original iguais ao valor calculado, sem desconto/acréscimo financeiro.

Uma única transação Prisma Serializable bloqueia empresa e pedido no banco,
valida os vínculos, atualiza totais/versão, numera a venda pelo helper de
`sequencias_automaticas`, cria venda/itens, fechamento, parcelas e auditoria.
Falha de parcela, auditoria ou outra etapa reverte tudo, inclusive a sequência.
Retries limitados seguem a classificação existente de conflitos transacionais,
somente após rollback, não repetindo erros de validação indiscriminadamente.

Unicidade por empresa/pedido e por fechamento/parcela complementa os locks entre
processos. Duas chamadas iguais não duplicam cobrança. Plano diferente retorna
409. A repetição verifica snapshot comercial, hashes canônicos, venda/itens e o
conjunto completo de parcelas; não zera saldo, recria auditoria ou muda a data.
Inativar cadastros após o fechamento não desfaz um resultado íntegro. Recebimentos
confirmados por outro fluxo podem reduzir saldo e alterar a situação, desde que
saldo, pagamentos e títulos permaneçam consistentes. Esta API não registra baixa.

O marcador de fechamento e os vínculos existentes bloqueiam as mutações comuns
de rascunho, mesmo se o status operacional regredir indevidamente. Edição de item
e fechamento disputam o mesmo pedido, sem trava apenas em memória. Logística
posterior deve preservar o snapshot financeiro, o plano e o fechamento.

Pedidos antigos com venda sem marcador, parcelas faltantes, soma incorreta ou
vínculos divergentes recebem 409 com regularização necessária. Não há backfill,
reparo por GET/retry ou cobrança retroativa por pressupor que CONCLUIDO é fechado.
Pedido sem fechamento comprovado recebe 409 na consulta. Ajustes financeiros
manuais, cancelamento e regularização exigem entrega própria.

## Banco, migration e implantação DB-first

A alteração está versionada como migration Prisma em
`prisma/migrations/20261017000000_pedido_contas_receber/migration.sql`, baseada na
`develop@90b64eea48067c07da8c56387e82f67c8d3c7316`. Este é o único arquivo SQL
da alteração: não há uma cópia paralela em `prisma/ddl`. A migration pode ser
executada pelo Prisma em bancos locais, e seu SQL pode ser aplicado no banco
compartilhado pelo responsável autorizado. A restrição é do comando e do fluxo
de implantação, não uma limitação do arquivo ao ambiente local.

A aprovação técnica e a aplicação compartilhada continuam pendentes na
[issue #91](https://github.com/arthur-manoel/ERP-Goia/issues/91). Versionar, enviar
ou incorporar a migration na PR não a executa automaticamente. Esta entrega não
aplica DDL no banco compartilhado nem libera comandos remotos em `prisma.config.ts`.

O SQL cria `pedido_cliente_fechamento`, plano/snapshot/hashes e chaves compostas
para empresa/cliente/pedido/venda/categoria; acrescenta `contas_receber.id_fechamento`
e `saldo` nullable, preservando registros antigos sem inventar saldo; impõe
unicidade por parcela e CHECK condicional de saldo. FKs novas usam RESTRICT,
preservando o histórico financeiro. Acrescenta FINANCEIRO ao enum de recursos,
sem conceder permissão automaticamente.

Em `item_venda`, a coluna STORED gerada `id_produto_sem_pedido` conserva uma linha
por venda/produto para linhas avulsas. Linhas originadas de pedido usam unicidade
por venda/item do pedido, permitindo duas variações do mesmo produto na venda.
A aplicação não escreve a coluna gerada (`@ignore` no Prisma). As FKs das colunas
usadas na expressão passam a ON UPDATE RESTRICT por compatibilidade com MySQL.

O responsável deve revisar a estrutura real, índices/FKs e valores adicionais do
enum, verificar duplicidades incompatíveis, aprovar, fazer backup e aplicar o SQL
da migration em janela adequada. O alvo precisa conter as alterações DB-first
anteriores de pedidos e financeiro; esta migration é incremental, não um baseline
completo do ERP. Antes da aplicação, estas consultas somente de leitura ajudam a
verificar as pré-condições; não aplicam a migration:

```sql
SELECT id_venda, id_pedido_cliente_item, COUNT(*) AS quantidade
FROM item_venda
WHERE id_pedido_cliente_item IS NOT NULL
GROUP BY id_venda, id_pedido_cliente_item
HAVING COUNT(*) > 1;

SELECT COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'permissoes_usuario'
  AND COLUMN_NAME = 'recurso';

SHOW CREATE TABLE item_venda;
```

A primeira consulta deve retornar zero linhas; duplicidades exigem regularização
explícita, nunca exclusão automática de dados. Compare o enum real com o `MODIFY`
da migration: valores extras existentes precisam ser preservados e revisados antes
da aplicação, não removidos para caber na lista fixa. Confirme também as FKs
anteriores `fk_item_venda_produto` e `fk_item_venda_pedido_item` e o índice
`uk_item_venda_produto`, incluindo suas definições. Se algum nome ou contrato for
diferente, interrompa para reconciliação aprovada antes do primeiro ALTER; essas
consultas não substituem a revisão completa da estrutura. Não edite uma migration
já aplicada para esconder divergências de histórico.

ALTER TABLE pode fazer commit implícito: em caso de falha parcial,
inspecione e reconcilie o estado antes de nova tentativa, sem marcar sucesso para
ocultar a falha nem reaplicar o SQL indiscriminadamente.

Depois da aplicação, introspecte o alvo autorizado com `npm run db:pull`, revise o
diff e gere o Client antes de implantar o código. Se a mesma estrutura já tiver
sido aplicada manualmente, valide sua equivalência integral antes de registrar
essa migration como aplicada no histórico pelo fluxo autorizado. `migrate resolve
--applied` registra histórico, mas não cria nem confere tabelas, colunas ou índices;
não é uma alternativa à aplicação/validação do SQL. O bloqueio de `prisma migrate`
remoto permanece: não altere a configuração para contorná-lo.

Não execute o preparador/baseline de testes, `db push` ou migration automática no
compartilhado. Para cópias locais existentes, valide primeiro a estrutura anterior
e o histórico; não aplique migrations históricas sobre tabelas já existentes nem
aceite reset. Use os bancos vazios isolados abaixo para reprodução automatizada.
Em MariaDB, JSON é representado como alias de texto com validação; uma introspecção
pode exibir LongText e CHECKs em vez do tipo JSON nativo MySQL. Preserve a semântica
e as constraints do DDL ao revisar o schema; não substitua por texto sem validação.

## Testes locais reproduzíveis

Use Node 24 e MySQL/MariaDB somente em loopback, com dois bancos vazios dedicados
de sufixo `_test`. Não utilize dados reais nem credenciais versionadas. O preparador
recusa host remoto ou banco com tabelas; não remove nem sobrescreve banco existente.
O histórico antigo de migrations não inclui todas as alterações DB-first já
integradas de pedidos/financeiro. Executar `migrate deploy` diretamente em um banco
vazio, sem essa base, não instala o contrato necessário. Por isso, o preparador
reconstrói a estrutura anterior a partir do schema do commit-base acima e só então
registra como aplicadas as migrations históricas já representadas nessa base.
Antes desse registro, também restaura o CHECK de ordem em `fluxo_producao_setor`
e o ON UPDATE dos timestamps de `estoque_minimo_local`, `setores` e
`fluxos_producao`, efeitos históricos que o snapshot Prisma não representa.
Essa adoção controlada é exclusiva do banco local vazio preparado pelo script;
não se deve copiar o registro de histórico para outro banco sem validar equivalência.

No preparo principal, a migration nova é executada por `prisma migrate deploy`,
que registra seu estado em `_prisma_migrations`. Com `--legado`, o preparador deixa
somente a migration nova pendente para o teste de atualização com dados anteriores.
Não usa `db execute` para aplicar a migration nova sem registrar seu histórico.

```powershell
$env:RECEBIVEIS_TEST_DATABASE_URL='mysql://<USER>:<SENHA>@127.0.0.1:3306/erp_goia_pedido_recebiveis_test'
$env:RECEBIVEIS_UPGRADE_TEST_DATABASE_URL='mysql://<USER>:<SENHA>@127.0.0.1:3306/erp_goia_pedido_recebiveis_upgrade_test'
$env:DATABASE_URL=$env:RECEBIVEIS_TEST_DATABASE_URL
npm ci
node scripts/preparar-pedido-recebiveis-test.mjs
node scripts/preparar-pedido-recebiveis-test.mjs --legado
npm run db:generate
npm run db:validate
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
node --test tests/recebiveis.integration.test.mjs
node --test tests/pedido-recebiveis-banco.integration.test.mjs
$env:PEDIDOS_TEST_DATABASE_URL=$env:RECEBIVEIS_TEST_DATABASE_URL
node --test tests/pedidos.integration.test.mjs
$env:CLIENTES_TEST_DATABASE_URL=$env:RECEBIVEIS_TEST_DATABASE_URL
node --test tests/clientes.integration.test.mjs
```

Execute os runners sequencialmente, nunca simultâneos no mesmo banco. O HTTP usa
o build real com `NODE_ENV=production`, login JWT real e empresa ativa; não utiliza
sessão DEV nem mock do banco. Os runners criam e removem apenas suas fixtures.
Falhas de parcela/auditoria são provocadas por triggers temporárias restritas às
fixtures locais e removidas ao final, não por opção disponível em produção.
O teste de atualização executa `migrate deploy`, verifica o registro concluído em
`_prisma_migrations` e executa novamente o comando para comprovar que a migration
concluída não reaplica o DDL. Também verifica a preservação dos registros antigos
e as novas constraints. Para repetir esse teste com as fixtures anteriores, use
outro banco de upgrade vazio; não tente aplicar o arquivo SQL diretamente sobre
estrutura já atualizada. Para repetir o preparo do zero, use outro banco vazio,
preservando os anteriores.
Falta de banco/configuração falha nos runners desta entrega e não é aprovação.
Resultados de execução ficam na descrição da PR, sem relatórios ou capturas no Git.

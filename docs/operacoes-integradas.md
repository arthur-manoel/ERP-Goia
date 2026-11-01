# Reservas, movimentações operacionais e recebimentos

Uma entrega integra os três cards: **Implementar as reservas de estoque**,
**Movimentar o estoque na entrega do pedido e na conclusão da produção** e
**Registrar o recebimento e a baixa das contas a receber**. A base é a develop
68639fd, sem pressupor que a PR de permissões gerais/perdas esteja incorporada.

## Telas e persistência

| Tela | Operações reais |
| --- | --- |
| `/estoque/reservas` | Reservas paginadas, filtros, origem, variação, local, quantidades, autoria, histórico e liberação; envio e recebimento de transferências |
| `/vendas/pedidos` | Seleção paginada dos pedidos persistidos, confirmação, reserva explícita, entrega parcial/total e fechamento com o contrato existente |
| `/producao/ordens` | Seleção das OPs persistidas, reservas de materiais, consumo real, etapas, apontamento efetivo e conclusão |
| `/financeiro` e `/financeiro/contas-receber` | Títulos reais, saldo, vencimento independente da quitação, histórico e recebimentos totais/parciais |

Essas telas usam o cliente da autenticação, sem `useErp`, `adaptador.ts` ou dados
de demonstração. Cadastro/edição estrutural de pedidos e OPs continuam disponíveis
nas APIs existentes; esta entrega concentra suas telas nas ações operacionais.
As telas genéricas de movimentações/kardex e outros módulos que ainda usam
`TelaModulo` mantêm suas limitações próprias; não são prova de persistência deste
fluxo. O kardex verificado nesta entrega é a tabela real ligada aos movimentos.

## Autorização e contrato comum

Bearer JWT real, usuário e vínculo ativos, empresa ativa e `X-Empresa-Id`.
Com vários vínculos, a seleção é obrigatória. O servidor confere as permissões
novamente dentro das transações novas. ADMIN global e nível EMPRESA preservam
as exceções existentes, sempre com vínculo ativo. Nenhum recurso de permissão
novo é criado ou concedido automaticamente.

| Operação | Permissões |
| --- | --- |
| Consultar reservas, posições auxiliares e transferências | ESTOQUE ler |
| Criar/liberar reserva | ESTOQUE ler/editar e PEDIDOS ou ORDENS_PRODUCAO editar, conforme a origem |
| Confirmar pedido/entrega | ESTOQUE ler/editar e PEDIDOS editar |
| Consultar documento operacional | ESTOQUE ler e leitura do módulo de origem |
| Consumo e entrada ao concluir produção | ORDENS_PRODUCAO editar e ESTOQUE editar; telas também exigem leitura |
| Enviar/receber transferência | ESTOQUE ler/editar |
| Consultar recebimentos/contas auxiliares | FINANCEIRO ler, perfil ADMINISTRACAO ou FINANCEIRO |
| Registrar recebimento | FINANCEIRO ler/editar, mesmo perfil financeiro |

As escritas novas recebem JSON estrito, até 64 KiB, sem empresa, usuário ou saldo
declarados pelo cliente. `Idempotency-Key` exige 8–128 caracteres ASCII
`A-Za-z0-9._:-`. Preserve a chave e o corpo após timeout. Mesma operação/autor e
conteúdo canônico retorna o resultado anterior; reutilização incompatível é 409.
Chaves diferenciam maiúsculas. As operações de estoque usam `operacao_erp`; os
pagamentos conservam a identidade em `pagamentos_receber`.

Quantidades são strings decimais positivas de até 12 inteiros/3 casas; dinheiro,
até 13 inteiros/2 casas. Não há arredondamento silencioso. Erros novos usam
`{success:false,error}`, 400/401/403/404/409/429/500, sem informações internas.
Respostas novas usam `Cache-Control: private, no-store`. Limites por usuário e
processo: 120 leituras/30 escritas por minuto; os contadores existentes dos
módulos de produção e financeiro continuam independentes.

## Estoque e reservas

`estoque` mantém o físico/reservado agregado da posição empresa/local/produto;
`estoque_variacao` detalha essa posição por variação, sem criar outro estoque.
As unicidades anteriores de empresa/local/produto e empresa/setor/produto
continuam valendo. Local e setor não são intercambiáveis.

O serviço oficial `movimentarNaTransacao` recebe o TransactionClient do documento,
atualiza físico, grade, movimento, kardex e auditoria. O endpoint manual usa esse
mesmo serviço. O lock comum produto/empresa e o lock do produto protegem saldo e
unidade, inclusive antes da primeira posição. As operações documentais novas
também serializam a empresa e têm unicidade de origem e de idempotência.

Uma reserva não cria movimento físico: aumenta somente a reserva da posição e
da grade correspondente. Disponível = físico menos reservas ativas daquela
variação/local. O saldo sem classificação fica separado das variações; não se
atribui saldo antigo automaticamente a cor/tamanho. Movimentos manuais aceitam
`idVariacao` opcional para entrada/saída identificada. Ajuste absoluto por grade
não é oferecido pelo inventário agregado; divergências exigem regularização.

O kardex conserva saldo anterior/atual agregado; a variação é rastreada pelo
movimento vinculado. A projeção da grade é conferida contra esse livro antes de
reservar/movimentar. Saída manual não consome reservas operacionais e não pode
gastar quantidades reservadas ou classificadas em outra variação.

As reservas existentes são reutilizadas, com `quantidade_consumida`,
`quantidade_liberada`, item do pedido e variação. Restante = quantidade inicial
menos consumo menos liberação. Redução/liberação preserva o registro e não
devolve mercadoria fisicamente. Legados não recebem consumo/autoria inventados:
as ações novas exigem `protocolo_integrado`, e divergências são bloqueadas.

Rascunho não reserva. Ao confirmar pedido, envie as alocações explicitamente:
insuficiência rejeita todas as alocações da chamada, sem parcial silenciosa.
`reservas: []` confirma para planejamento e mantém os itens pendentes; a tela
mostra reservado e pendente separadamente. Novas reservas são limitadas ao item
ainda não entregue/reservado. A API estrutural existente só edita rascunhos.

Para OPs liberadas/em execução, a necessidade vem da ficha planejada, agrupada
por material. Reserva é limitada ao material ainda necessário; não cria produto
futuro. Consumo exige registro explícito do que efetivamente saiu. No último
registro do material, `concluirConsumo:true` confirma o consumo e libera sobras;
quantidade zero só é aceita nessa confirmação explícita com motivo, sem criar
consumo ou movimento fictício, liberando apenas o saldo reservado;
diferença em relação ao planejado exige `motivoDivergencia`. O limite de reserva
do material é o planejamento vigente; consumo extra exige revisão operacional
desse planejamento, não uma baixa artificial no encerramento.

Cancelamento da OP existente libera as reservas integradas na mesma transação,
somente quando os demais efeitos permitem cancelar. Consumos/movimentos e
apontamentos continuam exigindo tratamento próprio. Não há cancelamento completo
de pedidos nesta base: o endpoint de liberação exige autorização do documento e
fornece o mecanismo, sem implementar aprovação gerencial, estorno ou notificações.

## Entrega, produção e transferência

A confirmação de entrega recebe o nome real do recebedor e quantidades por
reserva/item. Confere o que já saiu, consome somente essas reservas, grava
SAIDA_VENDA, itens da entrega e situação do pedido juntos. Falha reverte tudo.
Várias reservas do mesmo item podem compor uma entrega; a linha da remessa soma
as parcelas do item. Novas remessas não repetem o já expedido. O fechamento
financeiro preserva essa saída e não movimenta estoque novamente.

A conclusão da última etapa/OP exige produção efetiva positiva em todos os itens,
consumo real confirmado para cada material e movimentos de consumo íntegros.
Não transforma a ficha prevista em consumo. A quantidade produzida entra no
`id_local_estoque` explicitamente configurado da OP, no setor final do fluxo:
configure esse local como o estoque físico de produtos prontos da fábrica.
A variação precisa corresponder à cor/tamanho do item; POST de item aceita
`id_variacao` e resolve a grade no servidor. Ordens antigas sem identificação
suficiente são bloqueadas, sem presumir outra cor/tamanho.

As entradas usam uma origem única por OP/item. Repetir conclusão já realizada
é bloqueado pelo estado existente (409), sem nova entrada; os registros novos
de estoque/consumo têm repetição pela chave documentada. Uma OP antiga marcada
CONCLUIDA sem entradas identificadas retorna `baixaEstoque: pendente_regularizacao`;
não há backfill físico. Apontamentos/perdas da entrega separada não são pressupostos
nem reimplementados. Consumos legados sem vínculo comprovado também exigem revisão.

Transferência possui dois eventos reais: envio dá TRANSFERENCIA_SAIDA na origem
e deixa ENVIADA; confirmação física dá TRANSFERENCIA_ENTRADA e RECEBIDA no
destino. A conclusão da OP não comprova chegada à loja. A quantidade em trânsito
não fica disponível em nenhum dos locais. Repetir recebimento não duplica entrada.

## Recebimentos

O pagamento usa título/valor devido persistidos, conta financeira ativa da mesma
empresa e forma do enum existente. A data civil, no fuso do ERP, fica entre o
lançamento e hoje. Não há conta fixa, integração bancária ou conciliação externa.
DINHEIRO permite selecionar uma conta CAIXA real; o serviço aceita os tipos de
conta ativos já existentes, sem inventar uma restrição adicional por forma.

Saldo é valor final devido menos pagamentos confirmados e comprovados pelos
movimentos financeiros. Saldo armazenado e situação incompatíveis geram 409,
sem reconciliação implícita. Legado com saldo nulo pode derivá-lo de um histórico
íntegro; a primeira baixa grava o saldo correspondente. Pagamento cancelado com
movimento remanescente exige regularização, pois não há estorno implementado.

Parcial mantém PARCIAL e saldo positivo, mesmo se houver vencimento. Pagar o
restante muda para PAGO. Zero, negativo, excesso e título/documento cancelado
são rejeitados. Empresa/título têm locks compartilhados com as edições financeiras
existentes; duas baixas não gastam o mesmo saldo. Pagamento, ENTRADA/RECEBIMENTO
em `movimentacoes_financeiras`, saldo/situação e auditoria são atômicos. Não há
contador paralelo de saldo bancário; o extrato continua sendo o histórico oficial.

As telas preservam a identidade da tentativa na sessão antes de enviar.
Após resposta interrompida, repetem os mesmos dados; sucesso depende da resposta
real. Erros de validação permitem correção sem perder os campos. A empresa muda
o contexto e interrompe consultas; resposta antiga não substitui outro documento.

## APIs

| Método | Caminho | Corpo/filtros principais |
| --- | --- | --- |
| GET/POST | `/api/estoque/reservas` | GET pagina/limite/busca/origem/status; POST origem PEDIDO/PRODUCAO, idOrigem, idItem para pedido, idProduto, idVariacao opcional, idLocalEstoque, quantidade |
| GET | `/api/estoque/reservas/{id}` | pagina do histórico; detalhes, quantidades e auditoria paginada |
| POST | `/api/estoque/reservas/{id}/liberar` | quantidade, motivo |
| GET | `/api/estoque/reservas/opcoes` | busca de produto, até 50 resultados; locais/setores ativos |
| POST | `/api/pedidos/{id}/confirmar` | reservas: array de alocações explícitas, podendo ser vazio para planejamento |
| GET | `/api/pedidos/{id}/operacao` | itens, quantidades, reservas e entregas do pedido |
| POST | `/api/pedidos/{id}/entregas` | nomeRecebedor, itens: [{idItem,idReserva,quantidade}] |
| GET | `/api/pedidos/{id}/opcoes-fechamento` | categorias ativas de receita/ambas da empresa para a ação de fechamento |
| POST | `/api/pedidos/{id}/fechar` | contrato existente, com If-Match; categoria/vencimentos explícitos |
| GET | `/api/ordem_producao/{id}/operacao` | itens, etapas, materiais previstos, necessidades e reservas |
| POST | `/api/ordem_producao/{id}/consumos` | idReserva, quantidade, concluirConsumo, motivoDivergencia opcional |
| POST | `/api/ordem_producao/{id}/concluir` | contrato existente; conclusão também é chamada pela última etapa |
| GET | `/api/estoque/transferencias` | pagina, limite |
| POST | `/api/estoque/transferencias/enviar` | produto/variação, locais/setores origem/destino, quantidade, observacao |
| POST | `/api/estoque/transferencias/{id}/receber` | {} e confirmação de chegada física |
| GET/POST | `/api/contas_receber/{id}/recebimentos` | GET pagina/limite; POST valor, data YYYY-MM-DD, formaPagamento, idContaBancaria, referencia/observacao opcionais |
| GET | `/api/contas_receber/opcoes-recebimento` | contas ativas da empresa e formas de pagamento válidas |

Escrita nova de estoque retorna `{success:true,data,criado}` com 201 novo/200
repetição. Recebimento retorna `{success:true,data:{idPagamento,idTitulo,valor,
saldo,situacao,criado}}`, também 201/200. Consultas de recebimentos separam valor
original, devido, recebido, saldo, vencido, origem e histórico paginado. Os
contratos antigos de produção, estoque manual e fechamento preservam seus envelopes.

## Banco DB-first e reprodução local

As migrations incrementais `20261101000000_recebimentos_rastreaveis` e
`20261101010000_reservas_operacionais` acompanham o código. Preservam as tabelas
atuais e os legados; acrescentam autoria/conta/chave nos pagamentos, FKs compostas,
grade, consumo ligado ao movimento, histórico de idempotência e transferências.
Nenhuma publicação da PR executa esse SQL em outro ambiente.

Antes de aplicar em banco compartilhado/produção, o responsável deve conferir o
schema efetivo, nomes e definições dos índices/FKs, tabelas novas eventualmente
existentes, versões do enum e recebimentos antigos com empresa incompatível.
Faça backup e aprove o DDL pelo fluxo do time. ALTER pode fazer commit implícito:
em falha parcial, inspecione o alvo antes de repetir. Não adote histórico por
suposição e não desative as proteções do projeto. Gere o Client após introspecção
e revisão do alvo aprovado, antes de implantar o código que usa essas colunas.

O preparador abaixo só aceita host local, banco `_test` **vazio**, e reconstrói
o snapshot fixo da develop; não limpa nem sobrescreve banco. Não representa
baseline de implantação nem adoção automática de migrations. Restaura os CHECKs,
timestamps e coluna gerada não expressos integralmente pelo Prisma. Na cópia
sintética MariaDB, apenas as duas FKs antigas de empresa/cor e empresa/tamanho
em item_venda usam UPDATE RESTRICT, por incompatibilidade do CASCADE entre
empresa NOT NULL e nullable; os DDLs históricos não são editados. JSON da tabela
de idempotência conserva a semântica Json no Client, inclusive com o alias MariaDB.

```powershell
# Criar antes um MySQL/MariaDB local vazio e isolado, sem dados reais.
$env:OPERACOES_INTEGRADAS_TEST_DATABASE_URL='mysql://<USER>:<SENHA>@127.0.0.1:3306/erp_operacoes_integradas_test'
$env:RECEBIVEIS_TEST_DATABASE_URL=$env:OPERACOES_INTEGRADAS_TEST_DATABASE_URL
$env:DATABASE_URL=$env:OPERACOES_INTEGRADAS_TEST_DATABASE_URL
npm ci
node scripts/preparar-operacoes-integradas-test.mjs
npm run db:generate
npm run db:validate
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
# Sequenciais, cada runner remove somente suas fixtures:
node tests/operacoes-integradas.integration.test.mjs
node tests/recebimentos.integration.test.mjs
```

Os runners usam Next compilado em NODE_ENV=production, login real e HTTP real.
Ausência de URL/build/banco preparado falha explicitamente. Não execute runners
simultâneos no mesmo banco. Triggers temporárias de falha são exclusivas das
fixtures locais e removidas no final; não integram o DDL da aplicação.

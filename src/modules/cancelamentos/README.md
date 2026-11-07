# Cancelamentos e estornos de pedidos

Fluxo interno real em `/vendas/pedidos/cancelamentos`, com acompanhamento em
`/notificacoes`. Reutiliza pedidos, reservas, o serviço oficial
`movimentarNaTransacao`, parcelas, pagamentos, extrato e auditoria.

## Etapas e regras

1. Consulte a prévia calculada no servidor e informe o motivo.
2. Registre a solicitação. Nenhum estoque, cobrança ou pagamento é alterado.
3. Quando necessário, obtenha uma decisão gerencial explícita.
4. Execute a solicitação autorizada. O estado é revalidado contra a prévia.
5. Confirme separadamente devoluções físicas, inspeções e restituições.
6. A solicitação conclui quando suas pendências internas forem atendidas.

Os tipos são PEDIDO, ENTREGA e FECHAMENTO. Cancelar PEDIDO libera somente
reservas ainda ativas dos seus itens, anula suas entregas ativas e compensa o
restante da cobrança original. Não desfaz OP, compra ou consumo de material.
ENTREGA anula somente a remessa selecionada, sem liberar outras reservas.
FECHAMENTO compensa a cobrança, preservando as entregas e o estoque físico.
Venda, fechamento, valores originais das parcelas e pagamentos são preservados;
registros vinculados identificam cada anulação. Um fechamento estornado não pode
ser reaberto automaticamente: o endpoint retorna 409, impedindo cobrança duplicada.

Há uma solicitação aberta por pedido. Estados: AGUARDANDO_APROVACAO,
AGUARDANDO_EXECUCAO, REJEITADA, EXECUTADA_PENDENCIAS, CONCLUIDA e INTERVENCAO.
Rejeitar não executa efeitos. Reavaliar uma solicitação ainda não executada atualiza
os efeitos e invalida a decisão anterior, preservando a data histórica de referência.
Mudança do fechamento exige rejeitar a solicitação antiga e registrar outra.

## Prazo e permissões

O prazo usa o fechamento persistido, sete dias de calendário e o fuso
America/Sao_Paulo, inclusive fim de semana e feriado. O instante exato do limite
está dentro do prazo; depois dele é obrigatória a aprovação. Data ausente, futura
ou origem inconsistente é persistida para análise e bloqueia a execução enquanto
não houver regularização da origem. Alterar status não reinicia o prazo.

Bearer JWT e X-Empresa-Id selecionam vínculo e empresa ativos. O servidor confere
permissões novamente dentro da transação e antes de retornar uma repetição.

| Etapa | Autorização na empresa ativa |
| --- | --- |
| Solicitar/executar | PEDIDOS ler/excluir |
| Decidir | Proprietário (nível EMPRESA), ADMIN global ou cargo ativo expressamente habilitado e PEDIDOS ler |
| Executar liberação/retorno previsto | Também ESTOQUE ler/editar |
| Executar compensação de cobrança | Também FINANCEIRO ler/editar/excluir |
| Receber devolução | ESTOQUE ler/editar |
| Destinar avaria | ESTOQUE ler/editar e autorização gerencial |
| Registrar restituição | FINANCEIRO ler/editar |
| Habilitar cargo para decidir | Somente proprietário ou ADMIN, sempre com vínculo ativo |

`cargos.aprova_cancelamento` começa falso. Não há permissão por nome semelhante a
“gerente”, concessão automática a cargos ou novo enum de recurso. A configuração
fica na própria tela para administradores. Consultas permitem os participantes
com leitura em PEDIDOS, ESTOQUE ou FINANCEIRO; valores e obrigações financeiras
são devolvidos somente com FINANCEIRO ler. Nenhum corpo aceita empresa, autor,
saldo, valor do crédito ou aprovação implícita enviados pelo cliente.

## Retorno físico e avarias

Anular entrega apenas abre linhas de retorno ligadas às SAIDA_VENDA originais.
Cada linha preserva produto, variação, unidade, empresa e local/setor de origem.
Somente o recebimento efetivo, parcial ou total, pode gerar entrada. O destino é
informado explicitamente, precisa estar ativo e respeitar a posição de estoque.

APROVEITAVEL gera AJUSTE_ENTRADA/DEVOLUCAO_PEDIDO pelo serviço oficial, com
kardex e auditoria. AVARIADA registra recebimento físico e aguarda inspeção, sem
liberar saldo disponível. A destinação gerencial pode liberar após inspeção ou
descartar. DESCARTE registra entrada e baixa vinculadas na mesma transação, sem
incremento líquido do disponível. Não modifica apontamentos de perdas da produção.
Quantidades recebidas e destinadas nunca excedem o saldo da própria linha.

## Compensação financeira

O crédito de uma entrega é proporcional ao valor completo do pedido, incluindo
frete e descontos/acréscimos. O total é distribuído pelos valores líquidos dos
itens; quando todos são zero, pela quantidade. O rateio usa centavos inteiros,
maiores restos e diferenças de quantidades acumuladas para que estornos parciais
não criem nem percam centavos. Somente quantidades da remessa selecionada entram
na compensação; outras entregas continuam preservadas.

O crédito abate primeiro cobranças em aberto, na ordem das parcelas. A parte
correspondente a dinheiro já recebido constitui obrigação de restituição.
Saldo exigível = valor original menos créditos menos pagamentos confirmados,
limitado a zero. Títulos integralmente compensados ficam CANCELADO, sem apagar
pagamentos; pagamentos excedentes são aceitos somente com obrigação de restituição
exatamente correspondente. A execução financeira registra pedido_reembolso e
SAIDA/AJUSTE no extrato oficial, atomicamente, com conta ativa da empresa, autor,
data e auditoria. Não realiza transferência bancária externa. Reembolso não reabre
cobrança. Documentos fiscais externos exigem seu próprio processo; conclusão interna
não confirma cancelamento fiscal ou bancário externo.

## Contratos HTTP

GETs são consultas sem efeitos. Escritas usam JSON estrito (até 64 KiB) e
Idempotency-Key (8–128 caracteres ASCII). Dinheiro e quantidades são strings
decimais com ponto, até duas e três casas respectivamente. Chave, autor, operação,
documento e corpo identificam a repetição; reutilização incompatível retorna 409.
Respostas usam `{success,data,criado}` e cache privado desabilitado; 201 nova etapa,
200 repetição/consulta. Erros 400/401/403/404/409/429/500 não expõem SQL ou credenciais.
Limite por usuário/operação/processo: 120 consultas e 60 escritas por minuto.

| Método | Rota | Dados principais |
| --- | --- | --- |
| GET | `/api/pedidos/{id}/cancelamentos/previa` | tipo; idEntrega somente para ENTREGA |
| GET/POST | `/api/pedidos/{id}/cancelamentos` | GET pagina/limite; POST tipo, idEntrega opcional, motivo, hashEstado da prévia |
| GET | `/api/cancelamentos` | pagina/limite |
| GET | `/api/cancelamentos/{id}` | etapas, efeitos, decisões, retornos, créditos autorizados e histórico |
| POST | `/api/cancelamentos/{id}/decisao` | decisao APROVADA/REJEITADA, motivo |
| POST | `/api/cancelamentos/{id}/reavaliar` | hashEstado atualizado, motivo |
| POST | `/api/cancelamentos/{id}/executar` | {} |
| POST | `/api/cancelamentos/{id}/devolucoes` | idLinha, quantidade, condicao, observacao; idLocalEstoque/idSetor para APROVEITAVEL |
| POST | `/api/cancelamentos/{id}/destinacoes` | idRecebimento, quantidade, tratamento ESTOQUE/DESCARTE, motivo, idLocalEstoque, idSetor |
| POST | `/api/cancelamentos/{id}/reembolsos` | idCredito, valor, data YYYY-MM-DD, idContaBancaria, referencia/observacao opcionais |
| GET | `/api/cancelamentos/cargos` | configuração de cargos, exclusiva de administrador/proprietário |
| POST | `/api/cancelamentos/cargos/{id}` | aprovaCancelamento boolean |
| GET | `/api/notificacoes` | pagina/limite, somente do usuário/empresa ativos |
| POST | `/api/notificacoes/{id}/ler` | {} |
| POST | `/api/notificacoes/processar` | {}, repete entrega dos eventos pendentes |

## Concorrência e notificações

Solicitação e decisão não mantêm transação aberta aguardando ação humana.
Execução, devolução e restituição usam o lock de empresa compartilhado com entrega,
fechamento e pagamento, idempotência e constraints de origem. O hash inclui o
estado comercial, reservas, saídas, fechamento, parcelas e recebimentos: alterações
incompatíveis exigem reavaliação. Efeitos indivisíveis têm rollback conjunto.

Eventos internos são persistidos com o negócio numa outbox. Após o commit, a
entrega seleciona destinatários ativos e autorizados da mesma empresa e cria
notificações deduplicadas. Abrange análise pendente, decisão, retorno, restituição,
conclusão e intervenção. Falha posterior de entrega não desfaz o negócio; o evento
permanece pendente para repetição pela tela de notificações. Não há envio externo.

## Banco e implantação

Aplicar o incremento `20261101020000_cancelamentos_estornos` depois dos dois
incrementos de recebimentos e reservas desta PR, antes de publicar o código que
usa suas colunas. Acrescenta a habilitação de cargo, solicitações/decisões,
estornos vinculados, devoluções/destinações, créditos/restituições e notificações;
não reescreve históricos existentes. As FKs compostas preservam empresa e origem;
a coluna gerada pedido_ativo impede duas solicitações abertas para o mesmo pedido.

Desenvolvimento e validações com escrita usam exclusivamente banco MySQL/MariaDB
local e isolado. O preparador de operações integradas inclui este incremento em
base local vazia. Nada nesta PR aplica DDL no remoto. O responsável pelo banco
compartilhado/produção deve revisar o esquema real, fazer backup, aplicar o SQL pelo
fluxo aprovado do time, introspectar e gerar o Prisma Client antes da implantação.
Não reaplicar ALTERs cegamente após falha parcial e não adotar histórico de migrations
por suposição. No MariaDB, conservar a semântica Json de plano_efeitos e rateio_itens
no schema Prisma, apesar da introspecção como LONGTEXT.

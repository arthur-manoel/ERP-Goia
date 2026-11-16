# Fluxo de caixa

`GET /api/financeiro/fluxo-caixa?de=2026-11-01&ate=2026-11-30&pagina=1`

JWT e papel ADMINISTRACAO ou FINANCEIRO obrigatórios. Reutiliza a autorização
financeira de recebimentos: vínculo ativo, usuário/empresa ativos e leitura de
FINANCEIRO (com as exceções existentes de administrador e responsável da empresa).
Exige seleção por `X-Empresa-Id` quando há vários vínculos. A tela envia a empresa
ativa pelo provedor de autenticação e descarta respostas de consultas anteriores.
Permissão é conferida novamente na transação. Rate limit de 120 consultas por
usuário/minuto, no processo; respostas e erros têm `Cache-Control: no-store`.

## Cálculos

- Entradas e saídas realizadas: somente `movimentacoes_financeiras`, por data de
  movimentação, no período inclusivo. Datas civis no fuso America/Sao_Paulo (UTC−3).
  Pagamentos e títulos não são somados novamente aos movimentos realizados.
- Saldo do período: entradas menos saídas.
- Saldo bancário até a data final: saldos iniciais de todas as contas da empresa,
  cadastradas até a data final, inclusive inativas, mais entradas e menos saídas
  acumuladas até essa data.
  Inativar uma conta não elimina seu histórico do relatório.
- Pendências: títulos não pagos/não cancelados, pelo vencimento até a data final.
  Abatem pagamentos CONFIRMADO. Recebíveis também abatem créditos de cancelamento
  pela mesma regra de cobrança do módulo de recebimentos. O saldo persistido
  legado não substitui a apuração pelo histórico. Pagamentos acima do devido,
  créditos incompatíveis e pagamentos confirmados não positivos resultam em 409,
  sem apresentar um saldo silenciosamente corrigido.
- Projeção: saldo bancário até a data final + pendências a receber − a pagar.
- Atrasos: títulos com saldo positivo e vencimento estritamente anterior a hoje,
  independentemente do filtro do relatório; totais a receber e a pagar separados.

Os títulos refletem **a posição atual de pagamentos e créditos**. Filtrar um período
passado não reconstrói a carteira histórica naquela data. Essa regra aparece na
tela. Reembolsos só afetam o caixa quando registrados como movimentos financeiros;
não são criados títulos ou previsões de reembolso por este relatório. Movimentos
financeiros são o livro de caixa: correções/estornos precisam estar registrados
nele para afetar os realizados; o relatório não cria estornos implícitos ao ler
um pagamento cancelado.

## Contrato e validação

`de` e `ate`: datas AAAA-MM-DD válidas, início <= fim. `pagina`: inteiro positivo,
default 1; 25 movimentos por página, ordem por data e ID decrescentes. Páginas
acima do total retornam a última disponível (ou a primeira, se a lista for vazia).
Parâmetros desconhecidos e repetidos são rejeitados. A paginação não altera os indicadores.
Dinheiro é calculado com Prisma.Decimal e serializado como string com duas casas.
A exibição também preserva os centavos sem converter o total para Number.
Consultas compartilham uma transação REPEATABLE READ, sem escrita e sem migration.
Títulos, pagamentos, créditos e movimentos selecionam somente os campos necessários
ao relatório; dados auxiliares de compras e informações de auditoria não são carregados.

Envelope: `{ success: true, data: { entradas, saidas, saldoPeriodo,
saldoDisponivel, aReceber, aPagar, saldoProjetado, atrasados: { quantidade,
receber, pagar }, movimentos, pagina, totalPaginas } }`.

Testes em `tests/unit/fluxo-caixa` usam Prisma mockado. Cobrem cálculos, pagamentos
parciais, créditos, vencimentos, limites de data, escopo, autorização, validação e
paginação; não substituem homologação com dados reais no MySQL.

# Relatório de resultado

`GET /api/financeiro/resultado?de=2026-11-01&ate=2026-11-30`

Exige JWT de Administração/Financeiro, vínculo ativo e permissão de leitura financeira na empresa selecionada por `X-Empresa-Id`. O acesso é revalidado na transação de leitura com snapshot consistente. A resposta usa o envelope `{ success, data }`, `Cache-Control: no-store` e valores monetários em strings decimais.

## Critério de apuração

- Receita: soma de `contas_receber.valor_final` por categoria e vencimento.
- Custo de compras: soma de `contas_pagar.valor_final` por categoria e vencimento. Esses títulos têm compra obrigatória no schema.
- Despesa: soma de `despesas.valor` por categoria e `data_despesa`, apenas sem conta a pagar vinculada.
- Despesas vinculadas são representadas uma vez pelo valor final e vencimento do título de compra, na classificação Custo. Não se somam novamente os valores desses cadastros, que podem ser diferentes do título.
- Excluem-se títulos e despesas cancelados. Incluem-se títulos abertos, parciais e pagos pelo valor final integral, sem depender de pagamentos ou movimentos de caixa.
- As datas são civis inclusivas, armazenadas em colunas SQL `DATE`. Categorias históricas inativas continuam visíveis.
- Margem = receita − custo − despesa. Percentual = margem / receita × 100, ou `null` sem receita positiva. Aritmética com `Prisma.Decimal` e duas casas nos valores finais.

Esse é um resultado financeiro por vencimento, não uma DRE por competência ou fluxo de caixa. Compras de estoque são consideradas no vencimento dos títulos, sem cálculo de custo da mercadoria vendida. Créditos, devoluções e restituições não alteram o resultado enquanto não alterarem os valores finais/situação dos títulos. O schema de categoria distingue entrada/saída, mas não possui uma classificação contábil de custo/despesa; por isso a classificação usa a origem dos registros, explicitada na tela.

## Validação

`npx vitest run tests/unit/resultado` cobre valores decimais, ausência de receita, prejuízo, filtros de empresa/período, cancelamentos, exclusão de despesas vinculadas, snapshot, validação dos parâmetros e autenticação/autorização da API. São testes unitários com Prisma simulado; não substituem a conferência com registros de um banco de homologação.

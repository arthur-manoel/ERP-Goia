# Contexto operacional do ERP Goia

## Repositório e fluxo de contribuição

- Repositório oficial: `https://github.com/arthur-manoel/ERP-Goia`.
- Todo trabalho parte de `develop` atualizada.
- Cada entrega usa uma branch `feature/*` exclusiva e uma Pull Request própria para `develop`.
- Nunca fazer commit ou push direto para `develop` ou `main`.
- O diagrama de referência está em `C:\Users\maria\Downloads\Diagrama_ER_48_Tabelas_Completo.pdf`; o schema e o código atuais prevalecem em caso de divergência.
- Desenvolvimento e testes com dados usam somente MySQL ou MariaDB local e isolado. Credenciais locais ficam fora do Git. Nunca executar DDL, migrations ou `db push` no banco remoto compartilhado.

## Fluxo de negócio integrado

O fluxo operacional obrigatório, na ordem, é:

1. compra de tecido;
2. entrada física do tecido no estoque;
3. sublimação do tecido;
4. corte do tecido para virar peça;
5. costura dos cortes;
6. aprontamento ou acabamento das peças;
7. envio ou transferência das peças para a loja;
8. entrada das peças prontas no estoque da loja;
9. pedido do cliente;
10. entrega;
11. fechamento do pedido;
12. geração das contas a receber;
13. recebimento e baixa financeira.

Cada etapa deve usar registros reais, respeitar a empresa atual, permissões, transações e auditoria. Estoque físico, consumo, perdas, transferências, entrega, parcelas e recebimentos devem ser rastreáveis e idempotentes. O fluxo real não pode depender de `adaptador.ts`, mocks ou arrays em memória. Sublimação, corte, costura e aprontamento não podem ser omitidos.

Cancelamento, estorno, prazo de sete dias, aprovação gerencial e notificações de cancelamento estão fora destas entregas.

## Reservas, movimentações e recebimentos

Os três cards desta entrega estão ligados às ações reais de pedido, produção, transferência e financeiro. Reservar não movimenta o físico; consumo e entrega usam o mesmo serviço transacional de estoque e consomem somente o efetivado. Concluir a OP registra produtos efetivamente produzidos no local da fábrica; chegada à loja depende de transferência recebida. Fechar gera parcelas e preserva o estoque já baixado. Receber cria pagamento, extrato, saldo/situação e auditoria juntos.

A liberação no cancelamento de OP respeita os bloqueios de efeitos irreversíveis. Cancelamento gerencial de pedidos e estornos permanecem fora do escopo. Telas reais, APIs, limites dos legados e ordem de implantação: [operações integradas](operacoes-integradas.md). Nenhum DDL ou teste de escrita deve executar no remoto compartilhado.

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

Cancelamento de pedidos, estorno financeiro, prazo de sete dias, aprovação gerencial e notificações de cancelamento estão fora destas entregas.

## Permissões e apontamentos de perdas

O enum contém 18 recursos, sem concessões automáticas. Cada entrada de negócio
valida recurso, ação, vínculo e empresa; relatórios exigem RELATORIOS e leitura
dos domínios expostos. A [matriz de operações](permissoes-modulos.md) registra as
entradas e as exceções administrativas existentes.

Apontamentos usam ordem_producao_apontamento e a extensão de eventos
`20261031000000_eventos_apontamentos_producao`. Produção válida de uma etapa é
o limite da seguinte; ausência de histórico não restaura o planejado. Correção
e estorno de apontamento preservam os originais e revalidam sucessoras. Não são
estornos de estoque/financeiro, não comprovam consumo e não concluem etapas.
[Contrato, unidades, datas e implantação](../src/modules/apontamentos/README.md).

DDL testado localmente não significa DDL aplicado no banco compartilhado ou em
produção. Conferência/aplicação nos demais ambientes depende do responsável,
antes de habilitar o backend correspondente. A interface atual de apontamentos
continua usando estado temporário; integração de frontend não faz parte desta PR.

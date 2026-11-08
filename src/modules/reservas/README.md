# Reservas e operações integradas de estoque

Contrato, permissões, tabelas, exemplos de campos, regras de domínio e preparo
local em [Operações integradas](../../../docs/operacoes-integradas.md).

- `operacoes.ts`: contexto real, revalidação, transação e repetição segura.
- `reservas.service.ts`: criação, consumo/liberação de reserva e disponibilidade.
- `fluxo.service.ts`: consumo real, entrada da OP, entrega e transferência física.
- `router.ts`: contratos HTTP e consultas paginadas/autorizadas.

Todo efeito físico usa `movimentarNaTransacao` no módulo oficial de movimentação.
O cancelamento de OP e os caminhos novos/legados de conclusão chamam esses
serviços dentro da transação original. O fechamento financeiro preserva a saída
que já ocorreu na entrega. Reservas e movimentações são integradas nesta entrega.

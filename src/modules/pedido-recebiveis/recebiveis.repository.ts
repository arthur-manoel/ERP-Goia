import "server-only"
import { Prisma } from "@/generated/prisma/client"
import type { Contexto } from "@/modules/pedidos/pedidos.authorization"
import { PedidoError } from "@/modules/pedidos/pedidos.error"
import type { Transaction } from "@/modules/pedidos/pedidos.repository"

const include = {
  venda: {
    include: {
      item_venda: { orderBy: { id: "asc" as const } },
      // Não filtrar os filhos por empresa: um vínculo corrompido não pode sumir.
      contas_receber: {
        orderBy: [{ numero_parcela: "asc" as const }, { id: "asc" as const }],
        include: { pagamentos_receber: true },
      },
    },
  },
} satisfies Prisma.pedido_cliente_fechamentoInclude

export type Fechamento = Prisma.pedido_cliente_fechamentoGetPayload<{
  include: typeof include
}>

export const buscarFechamento = (tx: Transaction, ctx: Contexto, id: number) =>
  tx.pedido_cliente_fechamento.findFirst({
    where: { id_empresa: ctx.idEmpresa, id_pedido_cliente: id },
    include,
  })

export async function bloquearPedido(
  tx: Transaction,
  ctx: Contexto,
  id: number,
) {
  const rows = await tx.$queryRaw<Array<{ id: number }>>`
    SELECT id FROM pedido_cliente
    WHERE id = ${id} AND id_empresa = ${ctx.idEmpresa} FOR UPDATE
  `
  if (!rows.length) throw new PedidoError(404, "Pedido não encontrado.")
}

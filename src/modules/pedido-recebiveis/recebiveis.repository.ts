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
        include: { pagamentos_receber: { orderBy: { id: "asc" as const } } },
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

export async function buscarCreditos(
  tx: Transaction,
  ctx: Contexto,
  fechamento: Fechamento,
) {
  const rows = await tx.pedido_credito_receber.findMany({
    orderBy: { id: "asc" },
    where: {
      id_conta_receber: {
        in: fechamento.venda.contas_receber.map((c) => c.id),
      },
    },
    include: {
      pedido_cancelamento: {
        select: {
          id_empresa: true,
          id_pedido_cliente: true,
          id_fechamento_referencia: true,
          executado_em: true,
        },
      },
    },
  })
  if (
    rows.some(
      (c) =>
        c.id_empresa !== ctx.idEmpresa ||
        c.pedido_cancelamento.id_empresa !== ctx.idEmpresa ||
        c.pedido_cancelamento.id_pedido_cliente !==
          fechamento.id_pedido_cliente ||
        c.pedido_cancelamento.id_fechamento_referencia !== fechamento.id ||
        !c.pedido_cancelamento.executado_em,
    )
  )
    throw new PedidoError(
      409,
      "Crédito inconsistente; regularização necessária.",
    )
  const mapa = new Map<number, typeof rows>()
  for (const row of rows)
    mapa.set(row.id_conta_receber, [
      ...(mapa.get(row.id_conta_receber) ?? []),
      row,
    ])
  return mapa
}

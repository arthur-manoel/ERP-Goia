import type { DadosErp } from "@/features/erp/tipos"
import { dataIso } from "@/features/erp/validacao"
import type { Pedido } from "./schemas"

type Item = Pedido["items"][number]

/** Estimativa do adaptador local; não cria reservas nem movimenta estoque. */
export function consultarDisponibilidade(
  dados: DadosErp,
  item: Item,
  prazo: string,
  pedidoId?: string,
) {
  const produto = dados.materials.find((row) => row.id === item.productId)
  const variacao = produto?.variations?.find(
    (row) => row.id === item.variationId,
  )
  if (
    !produto ||
    (produto.variations?.length && !variacao) ||
    (item.variationId && !variacao) ||
    !dataIso.safeParse(prazo).success ||
    !Number.isInteger(item.quantity) ||
    item.quantity <= 0
  )
    return null

  const saldo = variacao?.quantity ?? produto.quantity
  // Pedidos abertos têm prioridade na estimativa. Pedidos legados sem grade
  // são abatidos conservadoramente para não prometer saldo já comprometido.
  const comprometido = dados.orders
    .filter(
      (pedido) =>
        pedido.id !== pedidoId &&
        ["Recebido", "Em produção"].includes(pedido.status),
    )
    .flatMap((pedido) => pedido.items)
    .filter(
      (outro) =>
        outro.productId === item.productId &&
        (!outro.variationId || outro.variationId === item.variationId),
    )
    .reduce((total, outro) => total + outro.quantity, 0)
  const previsto = dados.productions
    .filter(
      (ordem) =>
        ordem.productId === item.productId &&
        ["Planejada", "Em produção"].includes(ordem.status) &&
        ordem.dueDate <= prazo,
    )
    .reduce(
      (total, ordem) =>
        total +
        ordem.items
          .filter(
            (linha) => (linha.variationId ?? "") === (item.variationId ?? ""),
          )
          .reduce((soma, linha) => soma + linha.quantity, 0),
      0,
    )
  const estoque = Math.max(0, saldo - comprometido)
  const producao = Math.max(0, previsto - Math.max(0, comprometido - saldo))
  const faltante = Math.max(0, item.quantity - estoque - producao)
  return {
    estoque,
    producao,
    faltante,
    situacao:
      faltante > 0
        ? ("insuficiente" as const)
        : estoque >= item.quantity
          ? ("estoque" as const)
          : ("producao" as const),
  }
}

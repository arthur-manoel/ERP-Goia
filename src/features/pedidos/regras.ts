import type { DadosErp } from "@/features/erp/tipos"
import type { Pedido } from "./schemas"

export function validarPedido(
  dados: DadosErp,
  pedido: Omit<Pedido, "id">,
  id?: string,
) {
  for (const item of pedido.items) {
    const produto = dados.materials.find((row) => row.id === item.productId)
    if (produto?.variations?.length && !item.variationId)
      throw new Error(
        "Selecione o tamanho e a cor de cada produto com variações.",
      )
    if (
      item.variationId &&
      !produto?.variations?.some((row) => row.id === item.variationId)
    )
      throw new Error(
        "Uma variação do pedido não está cadastrada para o produto.",
      )
  }
  const cliente = dados.clients.find((row) => row.id === pedido.clientId)
  if (!cliente || cliente.role === "Fornecedor")
    throw new Error("Cliente não encontrado ou perfil incompatível.")

  const anterior = dados.orders.find((row) => row.id === id)
  if (cliente.status !== "Ativo" && anterior?.clientId !== cliente.id)
    throw new Error("Selecione um cliente ativo para novos pedidos.")

  if (
    pedido.items.some(
      (item) =>
        !dados.materials.some(
          (row) =>
            row.id === item.productId && row.category === "Produto pronto",
        ),
    )
  )
    throw new Error(
      "Um produto do pedido não está cadastrado como produto pronto.",
    )
}

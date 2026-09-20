import type { DadosErp } from "@/features/erp/tipos"
import type { OrdemProducao } from "./schemas"

export function validarOrdemProducao(
  dados: DadosErp,
  ordem: Omit<OrdemProducao, "id">,
) {
  const produto = dados.materials.find((row) => row.id === ordem.productId)
  if (
    ordem.variationId &&
    !produto?.variations?.some((item) => item.id === ordem.variationId)
  )
    throw new Error("Selecione uma variação cadastrada para este produto.")
  if (
    !dados.materials.some(
      (row) => row.id === ordem.productId && row.category === "Produto pronto",
    )
  )
    throw new Error("Selecione um produto pronto cadastrado.")
}

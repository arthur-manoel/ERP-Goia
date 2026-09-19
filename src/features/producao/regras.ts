import type { DadosErp } from "@/features/erp/tipos"
import type { OrdemProducao } from "./schemas"

export function validarOrdemProducao(
  dados: DadosErp,
  ordem: Omit<OrdemProducao, "id">,
) {
  if (
    !dados.materials.some(
      (row) =>
        row.id === ordem.productId && row.category === "Produto pronto",
    )
  )
    throw new Error("Selecione um produto pronto cadastrado.")
}

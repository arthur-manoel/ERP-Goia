import type { DadosErp } from "@/features/erp/tipos"
import { responsaveisDisponiveis } from "./responsaveis"
import type { OrdemProducao } from "./schemas"

export function validarOrdemProducao(
  dados: DadosErp,
  ordem: Omit<OrdemProducao, "id">,
) {
  const produto = dados.materials.find((row) => row.id === ordem.productId)
  if (!produto || produto.category !== "Produto pronto")
    throw new Error("Selecione um produto pronto cadastrado.")

  const variacoes = produto.variations ?? []
  if (variacoes.length) {
    for (const item of ordem.items)
      if (
        !item.variationId ||
        !variacoes.some((row) => row.id === item.variationId)
      )
        throw new Error(
          "Selecione uma combinação de cor e tamanho cadastrada para este produto.",
        )
  } else if (ordem.items.some((item) => item.variationId)) {
    throw new Error(
      "Este produto não possui combinações de cor e tamanho cadastradas.",
    )
  }

  if (!responsaveisDisponiveis.some((row) => row.id === ordem.responsible))
    throw new Error("Selecione um responsável cadastrado.")
}

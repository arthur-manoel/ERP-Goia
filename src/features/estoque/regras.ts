import type { DadosErp } from "@/features/erp/tipos"
import { unidadeInteira, type Material } from "./schemas"

export function validarMaterial(
  dados: DadosErp,
  material: Omit<Material, "id">,
  id?: string,
) {
  if (
    material.category !== "Produto pronto" &&
    (dados.productions.some((row) => row.productId === id) ||
      dados.orders.some((row) =>
        row.items.some((item) => item.productId === id),
      ))
  )
    throw new Error(
      "Este produto é usado em ordens ou pedidos e deve continuar como produto pronto.",
    )

  const anterior = dados.materials.find((row) => row.id === id)
  for (const variacao of anterior?.variations ?? []) {
    const vinculada =
      dados.orders.some((pedido) =>
        pedido.items.some(
          (item) => item.productId === id && item.variationId === variacao.id,
        ),
      ) ||
      dados.productions.some(
        (ordem) => ordem.productId === id && ordem.variationId === variacao.id,
      )
    const atual = material.variations?.find((item) => item.id === variacao.id)
    if (
      vinculada &&
      (!atual || atual.size !== variacao.size || atual.color !== variacao.color)
    )
      throw new Error(
        "Uma variação usada em pedidos ou ordens não pode ser removida nem ter tamanho ou cor alterados.",
      )
  }
  if (
    anterior &&
    anterior.unit !== material.unit &&
    (dados.materials.some((row) =>
      row.components.some((item) => item.materialId === id),
    ) ||
      dados.productions.some((row) => row.productId === id) ||
      dados.orders.some((row) =>
        row.items.some((item) => item.productId === id),
      ))
  )
    throw new Error(
      "A unidade deste material está vinculada a composições, ordens ou pedidos e não pode ser alterada.",
    )

  for (const component of material.components) {
    const alvo = dados.materials.find((row) => row.id === component.materialId)
    if (!alvo) throw new Error("Selecione componentes cadastrados no estoque.")
    if (component.materialId === id)
      throw new Error("Um produto não pode conter a si mesmo.")
    if (unidadeInteira(alvo.unit) && !Number.isInteger(component.quantity))
      throw new Error(
        `Informe quantidade inteira para o componente ${alvo.name} (${alvo.unit}).`,
      )

    const alcancaMaterial = (
      atual: string,
      visitados: Set<string>,
    ): boolean => {
      if (atual === id) return true
      if (visitados.has(atual)) return false
      visitados.add(atual)
      return (
        dados.materials.find((row) => row.id === atual)?.components ?? []
      ).some((item) => alcancaMaterial(item.materialId, visitados))
    }

    if (alcancaMaterial(component.materialId, new Set()))
      throw new Error(
        "Esta composição criaria uma dependência circular entre produtos.",
      )
  }
}

export function validarExclusaoMaterial(dados: DadosErp, id: string) {
  if (
    dados.materials.some((row) =>
      row.components.some((item) => item.materialId === id),
    )
  )
    throw new Error(
      "Este material faz parte de uma composição e não pode ser excluído.",
    )

  if (
    dados.productions.some((row) => row.productId === id) ||
    dados.orders.some((row) => row.items.some((item) => item.productId === id))
  )
    throw new Error(
      "Este produto possui ordens ou pedidos vinculados e não pode ser excluído.",
    )
}

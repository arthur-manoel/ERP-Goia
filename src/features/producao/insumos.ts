import type { DadosErp } from "@/features/erp/tipos"

export type SituacaoInsumo = "Suficiente" | "Insuficiente"

export type DisponibilidadeInsumo = {
  materialId: string
  name: string
  unit: string
  necessario: number
  disponivel: number
  diferenca: number
  situacao: SituacaoInsumo
}

/**
 * Verificação informativa da disponibilidade de insumos para a quantidade
 * planejada de um produto, a partir da composição (ficha técnica) cadastrada
 * no material. NÃO reserva, NÃO baixa e NÃO movimenta estoque: apenas compara
 * o consumo previsto com o saldo atual, para o usuário revisar antes de abrir
 * a ordem. Produtos comprados (sem composição) não têm insumos a verificar.
 */
export function calcularDisponibilidadeInsumos(
  dados: DadosErp,
  productId: string,
  quantidadeTotal: number,
): DisponibilidadeInsumo[] {
  const produto = dados.materials.find((row) => row.id === productId)
  if (!produto || !Number.isFinite(quantidadeTotal) || quantidadeTotal <= 0)
    return []

  return produto.components.map((componente) => {
    const insumo = dados.materials.find(
      (row) => row.id === componente.materialId,
    )
    const necessario = componente.quantity * quantidadeTotal
    const disponivel = insumo?.quantity ?? 0
    const diferenca = disponivel - necessario
    return {
      materialId: componente.materialId,
      name: insumo?.name ?? "Insumo não encontrado",
      unit: insumo?.unit ?? "",
      necessario,
      disponivel,
      diferenca,
      situacao: diferenca >= 0 ? "Suficiente" : "Insuficiente",
    }
  })
}

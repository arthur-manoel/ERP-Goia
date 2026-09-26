import type { DadosErp } from "@/features/erp/tipos"
import type { Setor } from "./schemas"

export function validarCadastroSetor(
  dados: DadosErp,
  setor: Omit<Setor, "id">,
  id?: string,
) {
  if (
    dados.sectors.some(
      (row) =>
        row.id !== id && row.name.toLowerCase() === setor.name.toLowerCase(),
    )
  )
    throw new Error("Já existe um setor com esse nome.")

  // "Excluir" um setor sempre inativa (exclusão lógica) — nunca removemos a
  // linha, pois outras telas (estoque, ordens de produção, fluxos) referenciam
  // o setor pelo id. Por isso a checagem de uso ativo acontece aqui, no mesmo
  // caminho usado tanto para editar quanto para inativar.
  const atual = dados.sectors.find((row) => row.id === id)
  const estaInativando = setor.status === "Inativo" && atual?.status !== "Inativo"
  if (estaInativando) {
    const fluxosAtivos = dados.productionFlows.filter(
      (fluxo) =>
        fluxo.status === "Ativo" &&
        fluxo.steps.some((step) => step.sectorId === id),
    )
    if (fluxosAtivos.length > 0)
      throw new Error(
        `Este setor está em uso no${fluxosAtivos.length > 1 ? "s fluxos" : " fluxo"} ${fluxosAtivos
          .map((fluxo) => `"${fluxo.name}"`)
          .join(", ")} e não pode ser inativado. Remova-o do${
          fluxosAtivos.length > 1 ? "s fluxos" : " fluxo"
        } antes de continuar.`,
      )
  }
}

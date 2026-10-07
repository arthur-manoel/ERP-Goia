import type { DadosErp } from "@/features/erp/tipos"
import type { FluxoProducao } from "./schemas"

export function validarCadastroFluxo(
  dados: DadosErp,
  fluxo: Omit<FluxoProducao, "id">,
  id?: string,
) {
  if (
    dados.productionFlows.some(
      (row) =>
        row.id !== id && row.name.toLowerCase() === fluxo.name.toLowerCase(),
    )
  )
    throw new Error("Já existe um fluxo de produção com esse nome.")

  const setoresPorId = new Map(dados.sectors.map((setor) => [setor.id, setor]))
  const invalidos = fluxo.steps.filter(
    (step) => setoresPorId.get(step.sectorId)?.status !== "Ativo",
  )
  if (invalidos.length > 0)
    throw new Error(
      "Um ou mais setores selecionados não existem mais ou estão inativos. Atualize as etapas do fluxo antes de salvar.",
    )
}

/**
 * Hoje nada mais referencia `productionFlows` (o encadeamento com Ordem de
 * Produção é a integração futura descrita na issue), então excluir/inativar
 * um fluxo não tem checagem de uso a fazer. Quando a Ordem de Produção passar
 * a apontar para um fluxo, adicione aqui a mesma checagem que já existe em
 * `features/setores/regras.ts`.
 */

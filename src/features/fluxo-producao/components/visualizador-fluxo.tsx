import { Fragment } from "react"
import { ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Setor } from "@/features/setores/schemas"
import type { FluxoProducao } from "../schemas"

/** Mostra o caminho da produção: Corte → Costura → Acabamento → ... */
export function VisualizadorFluxo({
  fluxo,
  setores,
}: {
  fluxo: Pick<FluxoProducao, "steps">
  setores: Setor[]
}) {
  const setoresPorId = new Map(setores.map((setor) => [setor.id, setor]))

  if (fluxo.steps.length === 0)
    return <span className="text-sm text-muted-foreground">Sem etapas.</span>

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {fluxo.steps.map((step, indice) => {
        const setor = setoresPorId.get(step.sectorId)
        return (
          <Fragment key={`${step.sectorId}-${indice}`}>
            {indice > 0 && (
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <Badge
              variant={setor?.status === "Ativo" ? "outline" : "destructive"}
            >
              {indice + 1}. {setor?.name ?? "Setor removido"}
            </Badge>
          </Fragment>
        )
      })}
    </div>
  )
}

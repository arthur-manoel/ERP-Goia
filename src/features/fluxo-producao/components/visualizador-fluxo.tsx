import { Fragment } from "react"
import { ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { SetorDoFluxo } from "../tipos"

/** Mostra o caminho da produção: 1. Sublimação → 2. Corte → 3. Costura ... */
export function CaminhoDoFluxo({ setores }: { setores: SetorDoFluxo[] }) {
  if (setores.length === 0)
    return <span className="text-sm text-muted-foreground">Sem etapas.</span>

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {setores
        .toSorted((a, b) => a.ordem - b.ordem)
        .map((setor, indice) => (
          <Fragment key={setor.id}>
            {indice > 0 && (
              <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <Badge variant={setor.ativo ? "outline" : "destructive"}>
              {indice + 1}. {setor.nome}
            </Badge>
          </Fragment>
        ))}
    </div>
  )
}

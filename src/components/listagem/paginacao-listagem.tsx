"use client"

import { Button } from "@/components/ui/button"

type Props = {
  pagina: number
  limite: number
  total: number
  totalPaginas: number
  /** Ex.: { singular: "fornecedor", plural: "fornecedores" }. */
  substantivo: { singular: string; plural: string }
  desabilitado?: boolean
  onPagina: (pagina: number) => void
}

export function PaginacaoListagem({
  pagina,
  limite,
  total,
  totalPaginas,
  substantivo,
  desabilitado = false,
  onPagina,
}: Props) {
  const inicio = total === 0 ? 0 : (pagina - 1) * limite + 1
  const fim = Math.min(pagina * limite, total)
  const nome = total === 1 ? substantivo.singular : substantivo.plural
  return (
    <nav
      aria-label="Paginação"
      className="flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-muted-foreground" aria-live="polite">
        {total === 0 ? `0 ${nome}` : `${inicio}–${fim} de ${total} ${nome}`}
      </p>
      {totalPaginas > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={desabilitado || pagina <= 1}
            onClick={() => onPagina(pagina - 1)}
          >
            Anterior
          </Button>
          <span className="tabular-nums">
            Página {pagina} de {totalPaginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={desabilitado || pagina >= totalPaginas}
            onClick={() => onPagina(pagina + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </nav>
  )
}

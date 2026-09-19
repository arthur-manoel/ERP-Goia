import { formatarQuantidade } from "@/lib/formatacao"
import { cn } from "@/lib/utils"
import {
  GraficoRosca,
  GraficoTendencia,
  type SegmentoRosca,
} from "./graficos-cliente"
import { formatarPercentual } from "./indicador-secoes"

export type SegmentoLegenda = SegmentoRosca & {
  /** Marca o segmento como situação que exige atenção (valor em destaque). */
  destaque?: boolean
}

/**
 * Cores da rosca, todas tokens do tema (claro/escuro). Só a situação que exige
 * atenção usa "var(--destructive)", e isso é decidido por quem chama.
 */
export const CORES_ROSCA = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-4)",
  "var(--chart-1)",
  "var(--chart-3)",
  "var(--border)",
] as const

/**
 * Rosca com legenda ao lado (embaixo em cards estreitos). A legenda traz rótulo,
 * quantidade e percentual em texto: o gráfico nunca é a única forma de ler a
 * informação, por isso ele fica oculto para leitores de tela.
 */
export function IndicadorRosca({
  segmentos,
  total,
}: {
  segmentos: SegmentoLegenda[]
  total: number
}) {
  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-5 @md:flex-row">
        <div aria-hidden className="size-36 shrink-0">
          <GraficoRosca segmentos={segmentos} className="size-full" />
        </div>

        <ul className="flex w-full min-w-0 flex-1 flex-col gap-2 text-sm">
          {segmentos.map((segmento, indice) => (
            <li
              key={`${indice}-${segmento.rotulo}`}
              className="flex items-center gap-2"
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-sm ring-1 ring-foreground/10"
                style={{ backgroundColor: segmento.cor }}
              />
              <span className="min-w-0 flex-1 break-words">{segmento.rotulo}</span>
              <span
                className={cn(
                  "font-medium tabular-nums",
                  segmento.destaque && segmento.quantidade > 0 && "text-destructive",
                )}
              >
                {formatarQuantidade(segmento.quantidade, 0)}
              </span>
              <span className="w-10 text-right text-muted-foreground tabular-nums">
                {total > 0 ? formatarPercentual(segmento.quantidade / total) : "-"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Mini-gráfico de tendência com descrição em texto para leitores de tela. */
export function IndicadorTendencia({
  valores,
  descricao,
  legenda,
}: {
  valores: number[]
  /** Frase que resume o gráfico (ex.: "Saldo foi de R$ X a R$ Y"). */
  descricao: string
  legenda: string
}) {
  if (valores.length < 2) return null

  return (
    <div className="flex flex-col gap-1">
      <div role="img" aria-label={descricao}>
        <GraficoTendencia valores={valores} />
      </div>
      <p className="text-xs text-muted-foreground">{legenda}</p>
    </div>
  )
}

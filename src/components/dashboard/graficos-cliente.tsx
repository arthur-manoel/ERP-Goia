"use client"

import { Line, LineChart, Pie, PieChart, YAxis } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"

/*
 * Únicas peças da Dashboard que rodam no navegador: só DESENHAM o gráfico com
 * os números que o servidor já validou. Legenda, valores e textos acessíveis
 * ficam em indicador-graficos.tsx (Server Component). Não recebem nada sensível
 * além do que a própria tela já exibe.
 */

export type SegmentoRosca = {
  rotulo: string
  quantidade: number
  /** Cor CSS do segmento. Use tokens do tema (ex.: "var(--primary)"). */
  cor: string
}

/** Gráfico de rosca. Segmentos com quantidade 0 não são desenhados. */
export function GraficoRosca({
  segmentos,
  className,
}: {
  segmentos: SegmentoRosca[]
  className?: string
}) {
  // Chaves por posição: evita que um rótulo com caracteres especiais quebre o CSS.
  const config: ChartConfig = Object.fromEntries(
    segmentos.map((s, i) => [`s${i}`, { label: s.rotulo, color: s.cor }]),
  )
  const dados = segmentos
    .map((s, i) => ({
      chave: `s${i}`,
      quantidade: s.quantidade,
      fill: `var(--color-s${i})`,
    }))
    .filter((d) => d.quantidade > 0)

  return (
    <ChartContainer config={config} className={cn("aspect-square", className)}>
      <PieChart>
        <Pie
          data={dados}
          dataKey="quantidade"
          nameKey="chave"
          innerRadius="68%"
          outerRadius="100%"
          stroke="var(--card)"
          strokeWidth={3}
          isAnimationActive={false}
        />
      </PieChart>
    </ChartContainer>
  )
}

/** Mini-gráfico de linha (sparkline), sem eixos nem grade. */
export function GraficoTendencia({
  valores,
  cor = "var(--primary)",
  className,
}: {
  valores: number[]
  cor?: string
  className?: string
}) {
  const config: ChartConfig = { valor: { label: "Valor", color: cor } }
  const dados = valores.map((valor, indice) => ({ indice, valor }))

  return (
    <ChartContainer config={config} className={cn("aspect-auto h-16 w-full", className)}>
      <LineChart data={dados} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Line
          dataKey="valor"
          type="monotone"
          stroke="var(--color-valor)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  )
}

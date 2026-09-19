import { Minus, TrendingDown, TrendingUp } from "lucide-react"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import { cn } from "@/lib/utils"

/*
 * Blocos secundários de um card de indicador. Todos são opcionais: o indicador
 * só os renderiza quando o backend enviou o dado correspondente.
 */

/** Bloco abaixo do valor principal, separado por uma linha e com título opcional. */
export function IndicadorSecao({
  titulo,
  children,
}: {
  titulo?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      {titulo && <h3 className="text-sm font-medium">{titulo}</h3>}
      {children}
    </div>
  )
}

export type DetalheIndicador = {
  rotulo: string
  valor: string
  /** Marca o item como situação que exige atenção. */
  destaque?: boolean
}

/** Lista de rótulo/valor (ex.: "Vencem hoje ... 5"). */
export function IndicadorDetalhes({ itens }: { itens: DetalheIndicador[] }) {
  return (
    <dl className="flex flex-col gap-1.5 text-sm">
      {itens.map((item) => (
        <div
          key={item.rotulo}
          className="flex items-baseline justify-between gap-3"
        >
          <dt className="text-muted-foreground">{item.rotulo}</dt>
          <dd
            className={cn(
              "text-right font-medium tabular-nums",
              item.destaque && "text-destructive",
            )}
          >
            {item.valor}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Medidor de um item em relação a uma meta (ex.: saldo do insumo em relação ao
 * mínimo). O percentual aparece em texto ao lado da barra.
 */
export function IndicadorMedidor({
  rotulo,
  percentual: valor,
  detalhe,
}: {
  rotulo: string
  /** 0 a 100. */
  percentual: number
  detalhe: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <Progress value={Math.min(100, Math.max(0, valor))} className="gap-1.5">
        <ProgressLabel className="min-w-0 break-words">{rotulo}</ProgressLabel>
        <ProgressValue />
      </Progress>
      <p className="text-xs text-muted-foreground">{detalhe}</p>
    </div>
  )
}

const formatadorPercentual = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 0,
})

/** Fração (0,25) em texto ("25%"). */
export function formatarPercentual(fracao: number) {
  return formatadorPercentual.format(fracao)
}

type IndicadorComparativoProps = {
  atual: number
  anterior: number
  /** Texto do período de comparação, vindo do backend (ex.: "vs. mês anterior"). */
  rotulo: string
  /** Quando a variação é boa ou ruim. "neutro" nunca é destacado. */
  melhorQuando: "maior" | "menor" | "neutro"
  /** Formata a diferença absoluta (ex.: "3" ou "R$ 2.700,00"). */
  formatarDiferenca: (diferencaAbsoluta: number) => string
}

/** Variação em relação a outro período. Só piora é destacada; a direção sempre vai por escrito. */
export function IndicadorComparativo({
  atual,
  anterior,
  rotulo,
  melhorQuando,
  formatarDiferenca,
}: IndicadorComparativoProps) {
  // Arredonda para evitar ruído de ponto flutuante (ex.: 0,1 + 0,2) em valores em reais.
  const diferenca = Math.round((atual - anterior) * 1000) / 1000
  const piorou =
    (melhorQuando === "maior" && diferenca < 0) ||
    (melhorQuando === "menor" && diferenca > 0)
  const Icone =
    diferenca === 0 ? Minus : diferenca > 0 ? TrendingUp : TrendingDown

  // Percentual só faz sentido quando o período anterior é positivo.
  const relativa =
    anterior > 0
      ? ` (${formatarPercentual(Math.abs(diferenca) / anterior)})`
      : ""
  const sinal = diferenca > 0 ? "+" : "-"
  const texto =
    diferenca === 0
      ? `Sem variação ${rotulo}`
      : `${sinal}${formatarDiferenca(Math.abs(diferenca))}${relativa} ${rotulo}`

  return (
    <p
      className={cn(
        "flex items-center gap-1.5 text-sm",
        piorou ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icone className="size-4 shrink-0" aria-hidden />
      <span>{texto}</span>
    </p>
  )
}

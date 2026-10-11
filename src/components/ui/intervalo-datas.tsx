"use client"

import * as React from "react"
import { cn } from "cn"

import { Input } from "@/components/ui/input"
import { erroIntervalo } from "@/lib/validacao/datas"

/**
 * Par de campos "De … até" com a regra única de intervalo:
 * a data final deve ser igual ou posterior à inicial.
 *
 * - Aplica `min`/`max` nos dois campos, então o seletor do navegador já bloqueia
 *   datas inválidas.
 * - Digitar ou colar uma data inválida (o navegador não impede isso) marca os
 *   campos e mostra a mensagem. Quem usa o componente deve tratar o intervalo
 *   como inválido (use `erroIntervalo`) em vez de filtrar com ele.
 */
export function IntervaloDatas({
  de,
  ate,
  onChangeDe,
  onChangeAte,
  rotuloDe = "De",
  rotuloAte = "Até",
  obrigatorio,
  disabled,
  className,
  inputClassName,
  separador = "até",
}: {
  de: string
  ate: string
  onChangeDe: (valor: string) => void
  onChangeAte: (valor: string) => void
  rotuloDe?: string
  rotuloAte?: string
  /** Exige as duas datas (relatórios). Em filtros opcionais, deixe de fora. */
  obrigatorio?: boolean
  disabled?: boolean
  className?: string
  inputClassName?: string
  separador?: React.ReactNode
}) {
  const idErro = React.useId()
  const erro = erroIntervalo(de, ate, { obrigatorio })
  const invalido = Boolean(erro)

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          aria-label={rotuloDe}
          value={de}
          max={ate || undefined}
          disabled={disabled}
          aria-invalid={invalido}
          aria-describedby={erro ? idErro : undefined}
          onChange={(e) => onChangeDe(e.target.value)}
          className={cn("w-[160px]", inputClassName)}
        />
        <span className="text-sm text-muted-foreground">{separador}</span>
        <Input
          type="date"
          aria-label={rotuloAte}
          value={ate}
          min={de || undefined}
          disabled={disabled}
          aria-invalid={invalido}
          aria-describedby={erro ? idErro : undefined}
          onChange={(e) => onChangeAte(e.target.value)}
          className={cn("w-[160px]", inputClassName)}
        />
      </div>
      {erro && (
        <p id={idErro} role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  )
}

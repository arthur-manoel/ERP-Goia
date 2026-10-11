import { cn } from "cn"

import { FieldError } from "@/components/ui/field"
import {
  excedeLimite,
  mensagemExcesso,
  tamanhoTexto,
} from "@/lib/validacao/texto"

/** Id do rodapé de um campo; use em `aria-describedby` do input/textarea. */
export const idRodapeLimite = (id: string) => `${id}-limite`

/**
 * Rodapé padrão de campos de texto com limite de caracteres:
 * mensagem de erro à esquerda e contador "45/100 caracteres" à direita.
 *
 * - Antes de o limite ser ultrapassado, só o contador aparece.
 * - Ao ultrapassar, o contador fica vermelho e a mensagem aparece na hora
 *   (sem esperar o envio), inclusive para texto colado.
 * - `erro` (vindo do schema/servidor) tem prioridade sobre a mensagem ao vivo.
 */
export function RodapeLimite({
  id,
  valor,
  limite,
  erro,
  className,
}: {
  id: string
  valor: string | null | undefined
  limite: number
  erro?: string
  className?: string
}) {
  const atual = tamanhoTexto(valor)
  const excedeu = excedeLimite(valor, limite)
  const mensagem = erro ?? (excedeu ? mensagemExcesso(valor, limite) : null)

  return (
    <div
      id={idRodapeLimite(id)}
      className={cn("flex items-start justify-between gap-3", className)}
    >
      <div className="min-w-0 flex-1">
        {mensagem && <FieldError>{mensagem}</FieldError>}
      </div>
      <span
        className={cn(
          "shrink-0 text-xs tabular-nums",
          excedeu ? "font-medium text-destructive" : "text-muted-foreground",
        )}
        aria-live={excedeu ? "polite" : "off"}
      >
        {atual}/{limite} caracteres
      </span>
    </div>
  )
}

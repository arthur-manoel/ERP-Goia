import { z } from "zod"
import { LIMITES, mensagemLimite } from "@/lib/validacao/texto"
import { MENSAGEM_INTERVALO } from "@/lib/validacao/datas"

/** Texto obrigatório de uma linha (nome, código...). `maximo` padrão: 120. */
export const texto = (
  rotulo: string,
  minimo = 2,
  maximo: number = LIMITES.nome,
) =>
  z
    .string()
    .trim()
    .min(minimo, `${rotulo}: informe pelo menos ${minimo} caracteres.`)
    .max(maximo, mensagemLimite(maximo))

/** Texto livre (descrição, observação). Pode ficar vazio; sempre devolve string. */
export const textoLivre = (maximo: number) =>
  z.string().trim().max(maximo, mensagemLimite(maximo))

/** Igual a `textoLivre`, mas aceita `undefined` e o transforma em `fallback`. */
export const textoOpcional = (maximo: number, fallback = "") =>
  z
    .string()
    .trim()
    .max(maximo, mensagemLimite(maximo))
    .optional()
    .transform((value) => (value && value.length > 0 ? value : fallback))

/**
 * Regra de intervalo para `superRefine`: a data final não pode vir antes da
 * inicial. Use quando o texto padrão serve; telas com mensagem própria (ex.:
 * "A entrega não pode ser anterior ao pedido.") mantêm a delas.
 */
export function validarIntervaloDatas(
  inicio: string,
  fim: string,
  ctx: z.RefinementCtx,
  caminho: string,
  mensagem: string = MENSAGEM_INTERVALO,
) {
  if (inicio && fim && fim < inicio)
    ctx.addIssue({ code: "custom", path: [caminho], message: mensagem })
}

export const numeroNaoNegativo = z
  .number({ error: "Informe um número válido." })
  .finite()
  .min(0, "O valor não pode ser negativo.")

export const inteiroPositivo = z
  .number({ error: "Informe uma quantidade válida." })
  .finite()
  .int("Use uma quantidade inteira.")
  .positive("A quantidade deve ser maior que zero.")

export const dinheiro = numeroNaoNegativo.refine(
  (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
  "Use no máximo duas casas decimais.",
)

export const dataIso = z
  .string()
  .refine(
    (value) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Informe uma data válida.",
  )

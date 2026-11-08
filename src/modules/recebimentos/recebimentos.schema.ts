import { z } from "zod"

export const formasRecebimento = [
  "DINHEIRO",
  "PIX",
  "CARTAO_CREDITO",
  "CARTAO_DEBITO",
  "BOLETO",
  "TRANSFERENCIA",
  "CHEQUE",
  "OUTRO",
] as const
export const idRecebimento = z.number().int().positive().max(2147483647)
export const chaveRecebimento = z
  .string()
  .regex(
    /^[A-Za-z0-9._:-]{8,128}$/,
    "Informe Idempotency-Key com 8 a 128 caracteres ASCII (letras, números, . _ : -).",
  )
export const dataRecebimento = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return (
      Number(value.slice(0, 4)) >= 1000 &&
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    )
  }, "Informe uma data civil válida.")
const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable()
    .optional()
export const recebimentoSchema = z.strictObject({
  valor: z
    .string()
    .regex(
      /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/,
      "Informe valor decimal com até duas casas.",
    )
    .refine((v) => /[1-9]/.test(v), "O valor deve ser positivo."),
  data: dataRecebimento,
  formaPagamento: z.enum(formasRecebimento),
  idContaBancaria: idRecebimento,
  referencia: texto(100),
  observacao: texto(255),
})
export const paginaRecebimentosSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(1000000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(25),
})
export type RecebimentoInput = z.infer<typeof recebimentoSchema>

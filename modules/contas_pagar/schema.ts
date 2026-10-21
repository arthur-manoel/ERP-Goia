import { z } from "zod"

const positiveId = z.number().int().positive().max(2_147_483_647)
const money = z.coerce
  .number()
  .finite("Valor deve ser numérico.")
  .nonnegative("Valor não pode ser negativo.")
  .max(9_999_999_999_999.99, "Valor excede o limite permitido.")
const installment = z
  .number()
  .int()
  .min(1, "Número da parcela deve ser no mínimo 1.")
  .max(9_999_999)

function parseDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
    ? null
    : parsed
}

const date = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve usar o formato AAAA-MM-DD.")
  .transform((value, context) => {
    const parsed = parseDate(value)
    if (!parsed) {
      context.addIssue({ code: "custom", message: "Data inválida." })
      return z.NEVER
    }
    return parsed
  })
const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional()

export const contaPagarSituacaoSchema = z.enum([
  "ABERTO",
  "PAGO",
  "PARCIAL",
  "VENCIDO",
  "CANCELADO",
])

const writableFields = {
  id_empresa: positiveId,
  id_compra: positiveId,
  id_categoria: positiveId,
  numero_parcela: installment,
  total_parcelas: installment,
  descricao: optionalText(255),
  data_vencimento: date,
  valor_original: money,
  valor_desconto: money,
  valor_acrescimo: money,
  situacao: contaPagarSituacaoSchema,
  observacao: optionalText(65_535),
}

function validInstallments(
  data: { numero_parcela?: number; total_parcelas?: number },
  context: z.RefinementCtx,
) {
  if (
    data.numero_parcela !== undefined &&
    data.total_parcelas !== undefined &&
    data.numero_parcela > data.total_parcelas
  ) {
    context.addIssue({
      code: "custom",
      path: ["numero_parcela"],
      message: "Número da parcela não pode ser maior que o total de parcelas.",
    })
  }
}

export const createContaPagarSchema = z
  .object({
    ...writableFields,
    numero_parcela: installment.default(1),
    total_parcelas: installment.default(1),
    descricao: writableFields.descricao.default(null),
    valor_desconto: money.default(0),
    valor_acrescimo: money.default(0),
    situacao: contaPagarSituacaoSchema.default("ABERTO"),
    observacao: writableFields.observacao.default(null),
  })
  .strict()
  .superRefine(validInstallments)

export const replaceContaPagarSchema = z
  .object({
    ...writableFields,
    numero_parcela: installment.default(1),
    total_parcelas: installment.default(1),
    descricao: writableFields.descricao.default(null),
    valor_desconto: money.default(0),
    valor_acrescimo: money.default(0),
    observacao: writableFields.observacao.default(null),
  })
  .strict()
  .superRefine(validInstallments)

export const updateContaPagarSchema = z
  .object(writableFields)
  .partial()
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe pelo menos um campo para atualizar. id, valor_final, data_lancamento e data_cadastro não podem ser alterados.",
  )

const queryId = z
  .string()
  .regex(/^\d+$/, "Deve ser um inteiro positivo.")
  .transform(Number)
  .pipe(positiveId)
const queryDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve usar o formato AAAA-MM-DD.")
  .transform((value, context) => {
    const parsed = parseDate(value)
    if (!parsed) {
      context.addIssue({ code: "custom", message: "Data inválida." })
      return z.NEVER
    }
    return parsed
  })

export const contaPagarIdSchema = queryId
export const listContasPagarSchema = z
  .object({
    page: queryId.default(1),
    limit: queryId.pipe(z.number().max(100)).default(20),
    id_empresa: queryId.optional(),
    id_categoria: queryId.optional(),
    id_compra: queryId.optional(),
    situacao: contaPagarSituacaoSchema.optional(),
    data_vencimento: queryDate.optional(),
    data_vencimento_inicio: queryDate.optional(),
    data_vencimento_fim: queryDate.optional(),
    data_lancamento_inicio: queryDate.optional(),
    data_lancamento_fim: queryDate.optional(),
    busca: z.string().trim().min(1).max(255).optional(),
    ordenar_por: z
      .enum([
        "data_vencimento",
        "data_lancamento",
        "data_cadastro",
        "valor_final",
      ])
      .default("data_vencimento"),
    ordem: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict()
  .superRefine((data, context) => {
    for (const [initial, final, label] of [
      [data.data_vencimento_inicio, data.data_vencimento_fim, "vencimento"],
      [data.data_lancamento_inicio, data.data_lancamento_fim, "lançamento"],
    ] as const) {
      if (initial && final && initial > final)
        context.addIssue({
          code: "custom",
          path: [`data_${label}_fim`],
          message: `Data inicial do período de ${label} não pode ser maior que a final.`,
        })
    }
  })

export type CreateContaPagarData = z.output<typeof createContaPagarSchema>
export type ReplaceContaPagarData = z.output<typeof replaceContaPagarSchema>
export type UpdateContaPagarData = z.output<typeof updateContaPagarSchema>
export type ContaPagarFilters = z.output<typeof listContasPagarSchema>
export type Pagination = { page: number; limit: number }
export type ContaPagarSituacao = z.output<typeof contaPagarSituacaoSchema>

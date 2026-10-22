import { z } from "zod"

const positiveId = z.number().int().positive().max(2_147_483_647)
const money = z.coerce
  .number()
  .finite("Valor deve ser numérico.")
  .positive("Valor deve ser maior que zero.")
  .max(9_999_999_999_999.99, "Valor excede o limite permitido.")
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000_000_1,
    "Valor deve ter no máximo duas casas decimais.",
  )

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
const accountId = positiveId.nullable().optional()
const observacao = z.string().trim().max(65_535).nullable().optional()

export const despesaSituacaoSchema = z.enum(["ABERTA", "PAGA", "CANCELADA"])

const writableFields = {
  id_empresa: positiveId,
  id_categoria: positiveId,
  id_conta_pagar: accountId,
  descricao: z.string().trim().min(1, "Descrição obrigatória.").max(255),
  data_despesa: date,
  valor: money,
  situacao: despesaSituacaoSchema,
  observacao,
}

export const createDespesaSchema = z
  .object({
    ...writableFields,
    id_conta_pagar: accountId.default(null),
    situacao: despesaSituacaoSchema.default("ABERTA"),
    observacao: observacao.default(null),
  })
  .strict()

export const replaceDespesaSchema = z
  .object({
    ...writableFields,
    id_conta_pagar: accountId.default(null),
    observacao: observacao.default(null),
  })
  .strict()

export const updateDespesaSchema = z
  .object(writableFields)
  .partial()
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe pelo menos um campo para atualizar. id e data_cadastro não podem ser alterados.",
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

export const despesaIdSchema = queryId
export const listDespesasSchema = z
  .object({
    page: queryId.default(1),
    limit: queryId.pipe(z.number().max(100)).default(20),
    id_empresa: queryId.optional(),
    id_categoria: queryId.optional(),
    situacao: despesaSituacaoSchema.optional(),
    data_despesa: queryDate.optional(),
    data_despesa_inicio: queryDate.optional(),
    data_despesa_fim: queryDate.optional(),
    data_cadastro_inicio: queryDate.optional(),
    data_cadastro_fim: queryDate.optional(),
    busca: z.string().trim().min(1).max(255).optional(),
    ordenar_por: z
      .enum(["data_despesa", "data_cadastro", "valor"])
      .default("data_despesa"),
    ordem: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .superRefine((data, context) => {
    for (const [initial, final, label, path] of [
      [
        data.data_despesa_inicio,
        data.data_despesa_fim,
        "despesa",
        "data_despesa_fim",
      ],
      [
        data.data_cadastro_inicio,
        data.data_cadastro_fim,
        "cadastro",
        "data_cadastro_fim",
      ],
    ] as const) {
      if (initial && final && initial > final)
        context.addIssue({
          code: "custom",
          path: [path],
          message: `Data inicial do período de ${label} não pode ser maior que a final.`,
        })
    }
  })

export type CreateDespesaData = z.output<typeof createDespesaSchema>
export type ReplaceDespesaData = z.output<typeof replaceDespesaSchema>
export type UpdateDespesaData = z.output<typeof updateDespesaSchema>
export type DespesaFilters = z.output<typeof listDespesasSchema>
export type Pagination = { page: number; limit: number }

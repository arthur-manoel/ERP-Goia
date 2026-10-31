import { z } from "zod"
import { textoMysqlSchema } from "@/lib/limites-texto"
import { Prisma } from "../../src/generated/prisma/client"

const positiveId = z.number().int().positive().max(2_147_483_647)
export const contaPagarIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "ID deve ser um inteiro positivo.")
  .transform(Number)
  .pipe(positiveId)
const money = z
  .union([
    z.number().finite(),
    z
      .string()
      .regex(
        /^\d+(?:\.\d{1,2})?$/,
        "Valor monetário inválido; use até duas casas decimais.",
      ),
  ])
  .transform((value) => new Prisma.Decimal(value))
  .refine(
    (value) =>
      value.isFinite() &&
      value.gte(0) &&
      value.lte("9999999999999.99") &&
      value.decimalPlaces() <= 2,
    "Valor deve ser não negativo, ter até duas casas decimais e respeitar DECIMAL(15,2).",
  )
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve usar AAAA-MM-DD.")
  .transform((value, context) => {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value ||
      Number(value.slice(0, 4)) < 1000
    ) {
      context.addIssue({ code: "custom", message: "Data inválida." })
      return z.NEVER
    }
    return parsed
  })
const installment = z.number().int().min(1).max(2_147_483_647)
export const contaPagarSituacaoSchema = z.enum([
  "ABERTO",
  "PAGO",
  "PARCIAL",
  "VENCIDO",
  "CANCELADO",
])
const fields = {
  id_empresa: positiveId,
  id_compra: positiveId,
  id_categoria: positiveId,
  data_vencimento: date,
  valor_original: money,
  valor_desconto: money,
  valor_acrescimo: money,
  numero_parcela: installment,
  total_parcelas: installment,
  descricao: z.string().trim().max(255).nullable().optional(),
  observacao: textoMysqlSchema.nullable().optional(),
  situacao: contaPagarSituacaoSchema,
}
function validInstallments(
  data: { numero_parcela?: number; total_parcelas?: number },
  context: z.RefinementCtx,
) {
  if (
    data.numero_parcela !== undefined &&
    data.total_parcelas !== undefined &&
    data.numero_parcela > data.total_parcelas
  )
    context.addIssue({
      code: "custom",
      path: ["numero_parcela"],
      message: "Número da parcela não pode ser maior que o total de parcelas.",
    })
}
const completeFields = {
  ...fields,
  numero_parcela: installment.default(1),
  total_parcelas: installment.default(1),
  valor_desconto: money.default(new Prisma.Decimal(0)),
  valor_acrescimo: money.default(new Prisma.Decimal(0)),
  descricao: fields.descricao.default(null),
  observacao: fields.observacao.default(null),
  situacao: contaPagarSituacaoSchema.default("ABERTO"),
}
export const createContaPagarSchema = z
  .object(completeFields)
  .strict()
  .superRefine(validInstallments)
export const updateContaPagarSchema = z
  .object(completeFields)
  .strict()
  .superRefine(validInstallments)
export const patchContaPagarSchema = z
  .object(fields)
  .partial()
  .strict()
  .superRefine(validInstallments)
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe pelo menos um campo para atualizar.",
  )
export const contaPagarParamsSchema = z
  .object({ id: contaPagarIdSchema })
  .strict()
const search = z.string().trim().max(255)
export const listContasPagarSchema = z
  .object({
    page: contaPagarIdSchema.default(1),
    limit: contaPagarIdSchema.pipe(z.number().max(100)).default(20),
    id_empresa: contaPagarIdSchema.optional(),
    id_compra: contaPagarIdSchema.optional(),
    id_categoria: contaPagarIdSchema.optional(),
    situacao: contaPagarSituacaoSchema.optional(),
    data_vencimento: date.optional(),
    data_vencimento_inicio: date.optional(),
    data_vencimento_fim: date.optional(),
    data_lancamento_inicio: date.optional(),
    data_lancamento_fim: date.optional(),
    descricao: search.optional(),
    busca: search.optional(),
    ordenar_por: z
      .enum([
        "id",
        "descricao",
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
    if ((data.page - 1) * data.limit > 2_147_483_647)
      context.addIssue({
        code: "custom",
        path: ["page"],
        message: "Paginação excede o limite permitido.",
      })
    for (const [prefix, start, end] of [
      [
        "data_vencimento",
        data.data_vencimento_inicio,
        data.data_vencimento_fim,
      ],
      [
        "data_lancamento",
        data.data_lancamento_inicio,
        data.data_lancamento_fim,
      ],
    ] as const) {
      if (start && end && start > end)
        context.addIssue({
          code: "custom",
          path: [`${prefix}_fim`],
          message: "Data inicial não pode ser maior que a final.",
        })
    }
    if (
      data.data_vencimento &&
      (data.data_vencimento_inicio || data.data_vencimento_fim)
    )
      context.addIssue({
        code: "custom",
        path: ["data_vencimento"],
        message: "Use data exata ou período de vencimento, não ambos.",
      })
  })
export type CreateContaPagarData = z.output<typeof createContaPagarSchema>
export type UpdateContaPagarData = z.output<typeof updateContaPagarSchema>
export type PatchContaPagarData = z.output<typeof patchContaPagarSchema>
export type ContaPagarFilters = Omit<
  z.output<typeof listContasPagarSchema>,
  "page" | "limit" | "situacao"
> & { situacao?: "ABERTO" | "PAGO" | "PARCIAL" | "ATRASADO" | "CANCELADO" }
export type Pagination = { page: number; limit: number }

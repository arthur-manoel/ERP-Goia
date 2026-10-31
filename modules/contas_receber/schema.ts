import { z } from "zod"
import { textoMysqlSchema } from "@/lib/limites-texto"
import { Prisma } from "../../src/generated/prisma/client"

const positiveId = z.number().int().positive().max(2_147_483_647)
export const contaReceberIdSchema = z
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
export const contaReceberSituacaoSchema = z.enum([
  "ABERTO",
  "PARCIAL",
  "PAGO",
  "VENCIDO",
  "CANCELADO",
])
const fields = {
  id_empresa: positiveId,
  id_venda: positiveId,
  id_categoria: positiveId,
  data_vencimento: date,
  valor_original: money,
  valor_desconto: money,
  valor_acrescimo: money,
  numero_parcela: installment,
  total_parcelas: installment,
  descricao: z.string().trim().max(255).nullable().optional(),
  observacao: textoMysqlSchema.nullable().optional(),
  situacao: contaReceberSituacaoSchema,
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
  situacao: contaReceberSituacaoSchema.default("ABERTO"),
}
export const createContaReceberSchema = z
  .object(completeFields)
  .strict()
  .superRefine(validInstallments)
export const updateContaReceberSchema = z
  .object(completeFields)
  .strict()
  .superRefine(validInstallments)
export const patchContaReceberSchema = z
  .object(fields)
  .partial()
  .strict()
  .superRefine(validInstallments)
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe pelo menos um campo para atualizar.",
  )
export const contaReceberParamsSchema = z
  .object({ id: contaReceberIdSchema })
  .strict()

const search = z.string().trim().max(255)
export const listContasReceberSchema = z
  .object({
    page: contaReceberIdSchema.default(1),
    limit: contaReceberIdSchema.pipe(z.number().max(100)).default(20),
    id_empresa: contaReceberIdSchema.optional(),
    id_venda: contaReceberIdSchema.optional(),
    id_categoria: contaReceberIdSchema.optional(),
    situacao: contaReceberSituacaoSchema.optional(),
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

export type CreateContaReceberData = z.output<typeof createContaReceberSchema>
export type UpdateContaReceberData = z.output<typeof updateContaReceberSchema>
export type PatchContaReceberData = z.output<typeof patchContaReceberSchema>
export type ContaReceberFilters = Omit<
  z.output<typeof listContasReceberSchema>,
  "page" | "limit" | "situacao"
> & { situacao?: "ABERTO" | "PARCIAL" | "PAGO" | "ATRASADO" | "CANCELADO" }
export type Pagination = { page: number; limit: number }

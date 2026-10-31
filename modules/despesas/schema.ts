import { z } from "zod"
import { textoMysqlSchema } from "@/lib/limites-texto"
import { Prisma } from "../../src/generated/prisma/client"
const positiveId = z.number().int().positive().max(2_147_483_647)
export const despesaIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "ID deve ser um inteiro positivo.")
  .transform(Number)
  .pipe(positiveId)
const money = z
  .union([
    z.number().finite(),
    z.string().regex(/^\d+(?:\.\d{1,2})?$/, "Valor monetário inválido."),
  ])
  .transform((value) => new Prisma.Decimal(value))
  .refine(
    (value) =>
      value.isFinite() &&
      value.gt(0) &&
      value.lte("9999999999999.99") &&
      value.decimalPlaces() <= 2,
    "Valor deve ser maior que zero, com até duas casas decimais, dentro de DECIMAL(15,2).",
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
export const despesaSituacaoSchema = z.enum(["ABERTA", "PAGA", "CANCELADA"])
const fields = {
  id_empresa: positiveId,
  id_categoria: positiveId,
  id_conta_pagar: positiveId.nullable().optional(),
  descricao: z.string().trim().min(1, "Descrição obrigatória.").max(255),
  data_despesa: date,
  valor: money,
  situacao: despesaSituacaoSchema,
  observacao: textoMysqlSchema.nullable().optional(),
}
const complete = {
  ...fields,
  id_conta_pagar: fields.id_conta_pagar.default(null),
  observacao: fields.observacao.default(null),
  situacao: despesaSituacaoSchema.default("ABERTA"),
}
export const createDespesaSchema = z.object(complete).strict()
export const updateDespesaSchema = z.object(complete).strict()
export const patchDespesaSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe pelo menos um campo para atualizar.",
  )
export const despesaParamsSchema = z.object({ id: despesaIdSchema }).strict()
export const listDespesasSchema = z
  .object({
    page: despesaIdSchema.default(1),
    limit: despesaIdSchema.pipe(z.number().max(100)).default(20),
    id_empresa: despesaIdSchema.optional(),
    id_categoria: despesaIdSchema.optional(),
    id_conta_pagar: despesaIdSchema.optional(),
    situacao: despesaSituacaoSchema.optional(),
    data_despesa: date.optional(),
    data_despesa_inicio: date.optional(),
    data_despesa_fim: date.optional(),
    data_cadastro_inicio: date.optional(),
    data_cadastro_fim: date.optional(),
    descricao: z.string().trim().max(255).optional(),
    busca: z.string().trim().max(255).optional(),
    ordenar_por: z
      .enum(["data_despesa", "data_cadastro", "valor"])
      .default("data_despesa"),
    ordem: z.enum(["asc", "desc"]).default("desc"),
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
      ["data_despesa", data.data_despesa_inicio, data.data_despesa_fim],
      ["data_cadastro", data.data_cadastro_inicio, data.data_cadastro_fim],
    ] as const)
      if (start && end && start > end)
        context.addIssue({
          code: "custom",
          path: [`${prefix}_fim`],
          message: "Data inicial não pode ser maior que a final.",
        })
    if (
      data.data_despesa &&
      (data.data_despesa_inicio || data.data_despesa_fim)
    )
      context.addIssue({
        code: "custom",
        path: ["data_despesa"],
        message: "Use data exata ou período, não ambos.",
      })
  })
export type CreateDespesaData = z.output<typeof createDespesaSchema>
export type PatchDespesaData = z.output<typeof patchDespesaSchema>
export type UpdateDespesaData = z.output<typeof updateDespesaSchema>
export type DespesaFilters = Omit<
  z.output<typeof listDespesasSchema>,
  "page" | "limit"
>
export type Pagination = { page: number; limit: number }

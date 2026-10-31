import { z } from "zod"

export const idSchema = z.number().int().positive().max(2_147_483_647)
const queryId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(idSchema)
export const paramsSchema = z.object({ id: queryId }).strict()
export const statusSchema = z.enum(["ATIVO", "INATIVO"])
const prazo = z.number().int().min(0).max(2_147_483_647).nullable()
const fields = {
  prazo_pagamento: prazo,
  prazo_entrega: prazo,
  observacao: z.string().trim().max(255).nullable(),
  status: statusSchema,
}
export const createSchema = z
  .object({
    id_fornecedor: idSchema,
    prazo_pagamento: prazo.optional(),
    prazo_entrega: prazo.optional(),
    observacao: fields.observacao.optional(),
    status: z.literal("ATIVO").optional(),
  })
  .strict()
export const updateSchema = z.object(fields).strict()
export const patchSchema = updateSchema
  .partial()
  .strict()
  .refine(
    (data) => Object.values(data).some((v) => v !== undefined),
    "Informe ao menos um campo editável.",
  )
const pagination = {
  page: queryId.default(1),
  limit: queryId.pipe(z.number().max(100)).default(20),
}
const search = {
  busca: z.string().trim().max(150).optional(),
  nome: z.string().trim().max(150).optional(),
  cnpj: z
    .string()
    .trim()
    .min(1)
    .max(18)
    .regex(/^[A-Za-z0-9./-]+$/)
    .refine((value) => /[A-Za-z0-9]/.test(value), "Informe caracteres do CNPJ.")
    .optional(),
}
const safeSkip = (v: { page: number; limit: number }) =>
  (v.page - 1) * v.limit <= 2_147_483_647
export const paginationSchema = z
  .object(pagination)
  .strict()
  .refine(safeSkip, "Paginação fora do limite.")
export const filtersSchema = z
  .object({
    ...pagination,
    ...search,
    id_fornecedor: queryId.optional(),
    status: statusSchema.optional(),
    ordenar_por: z
      .enum(["id", "fornecedor", "prazo_pagamento", "prazo_entrega", "status"])
      .default("fornecedor"),
    ordem: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict()
  .refine(safeSkip, "Paginação fora do limite.")
export const suppliersSchema = z
  .object({
    ...pagination,
    ...search,
    tipo: z
      .enum(["ESPECIFICO", "GLOBAL_DISPONIVEL"])
      .default("GLOBAL_DISPONIVEL"),
    ordem: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict()
  .refine(safeSkip, "Paginação fora do limite.")
export type CreateInput = z.output<typeof createSchema>
export type UpdateInput = z.output<typeof updateSchema>
export type PatchInput = z.output<typeof patchSchema>
export type Filters = z.output<typeof filtersSchema>
export type SupplierFilters = z.output<typeof suppliersSchema>
export type Pagination = z.output<typeof paginationSchema>

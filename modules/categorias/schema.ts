import { z } from "zod"

export function normalizeNome(value: string) {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim()
}
const positiveId = z.number().int().positive().max(2_147_483_647)
export const categoriaIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "ID deve ser um inteiro positivo.")
  .transform(Number)
  .pipe(positiveId)
export const categoriaParamsSchema = z
  .object({ id: categoriaIdSchema })
  .strict()
export const categoriaStatusSchema = z.enum(["ATIVA", "INATIVA"])
const fields = {
  id_empresa: positiveId.optional(),
  nome: z.string().transform(normalizeNome).pipe(z.string().min(2).max(100)),
  descricao: z.string().trim().max(255).nullable().optional(),
  status: categoriaStatusSchema,
}
const complete = {
  ...fields,
  descricao: fields.descricao.default(null),
  status: categoriaStatusSchema.default("ATIVA"),
}
export const createCategoriaSchema = z.object(complete).strict()
export const updateCategoriaSchema = z.object(complete).strict()
export const patchCategoriaSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe pelo menos um campo para atualizar.",
  )
export const listCategoriasSchema = z
  .object({
    page: categoriaIdSchema.default(1),
    limit: categoriaIdSchema.pipe(z.number().max(100)).default(20),
    id_empresa: categoriaIdSchema.optional(),
    nome: z
      .string()
      .transform(normalizeNome)
      .pipe(z.string().max(100))
      .optional(),
    busca: z
      .string()
      .transform(normalizeNome)
      .pipe(z.string().max(100))
      .optional(),
    status: categoriaStatusSchema.optional(),
    ordenar_por: z.enum(["id", "nome"]).default("nome"),
    ordem: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict()
  .refine((data) => (data.page - 1) * data.limit <= 2_147_483_647, {
    path: ["page"],
    message: "Paginação excede o limite permitido.",
  })
export type CreateCategoriaData = z.output<typeof createCategoriaSchema>
export type UpdateCategoriaData = z.output<typeof updateCategoriaSchema>
export type PatchCategoriaData = z.output<typeof patchCategoriaSchema>
export type CategoriaFilters = Omit<
  z.output<typeof listCategoriasSchema>,
  "page" | "limit"
>
export type Pagination = { page: number; limit: number }

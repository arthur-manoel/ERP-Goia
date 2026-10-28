import { z } from "zod"

const positiveId = z.number().int().positive().max(2_147_483_647)
export const normalizeName = (value: string) =>
  value.trim().replace(/\s+/g, " ")
const nome = z
  .string()
  .transform(normalizeName)
  .pipe(
    z
      .string()
      .min(2, "Nome deve ter no mínimo 2 caracteres.")
      .max(100, "Nome deve ter no máximo 100 caracteres."),
  )
const status = z.enum(["ATIVA", "INATIVA"])
const fields = {
  nome,
  descricao: z.string().trim().max(255).nullable().optional(),
  id_empresa: positiveId.optional(),
  status,
}

export const createCategoriaSchema = z
  .object({
    ...fields,
    descricao: fields.descricao.default(null),
    status: status.default("ATIVA"),
  })
  .strict()

// PUT substitui os campos editáveis e restaura os opcionais aos padrões.
export const updateCategoriaSchema = createCategoriaSchema
export const patchCategoriaSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe pelo menos um campo para atualizar. id não pode ser alterado.",
  )

export const categoriaIdSchema = z
  .string()
  .regex(/^\d+$/, "ID deve ser um inteiro positivo.")
  .transform(Number)
  .pipe(positiveId)
export const listCategoriasSchema = z
  .object({
    page: categoriaIdSchema.default(1),
    limit: categoriaIdSchema.pipe(z.number().max(100)).default(20),
    id_empresa: categoriaIdSchema.optional(),
    nome: z
      .string()
      .transform(normalizeName)
      .pipe(z.string().min(1).max(100))
      .optional(),
    busca: z
      .string()
      .transform(normalizeName)
      .pipe(z.string().max(100))
      .optional(),
    status: status.optional(),
    ordenar_por: z.enum(["nome", "id"]).default("nome"),
    ordem: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict()

export type CreateCategoriaData = z.output<typeof createCategoriaSchema>
export type UpdateCategoriaData = z.output<typeof updateCategoriaSchema>
export type PatchCategoriaData = z.output<typeof patchCategoriaSchema>
export type CategoriaFilters = Omit<
  z.output<typeof listCategoriasSchema>,
  "page" | "limit"
>
export type Pagination = { page: number; limit: number }

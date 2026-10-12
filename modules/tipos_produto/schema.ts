import { z } from "zod"

const id = z.number().int().positive().max(2_147_483_647)
const nome = z
  .string()
  .trim()
  .min(1, "Nome obrigatório.")
  .max(100, "Nome deve ter no máximo 100 caracteres.")
const descricao = z.string().trim().max(255).nullable().optional()

export const createTipoProdutoSchema = z.object({ nome, descricao }).strict()
export const replaceTipoProdutoSchema = z
  .object({ nome, descricao: descricao.default(null) })
  .strict()
export const updateTipoProdutoSchema = z
  .object({ nome, descricao })
  .partial()
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe pelo menos um campo para atualizar. id não pode ser alterado.",
  )
export const tipoProdutoIdSchema = z
  .string()
  .regex(/^\d+$/, "ID deve ser um inteiro positivo.")
  .transform(Number)
  .pipe(id)
export const listTiposProdutoSchema = z
  .object({
    page: tipoProdutoIdSchema.default(1),
    limit: tipoProdutoIdSchema.pipe(z.number().max(100)).default(20),
    nome: nome.optional(),
  })
  .strict()

export type CreateTipoProdutoData = z.output<typeof createTipoProdutoSchema>
export type ReplaceTipoProdutoData = z.output<typeof replaceTipoProdutoSchema>
export type UpdateTipoProdutoData = z.output<typeof updateTipoProdutoSchema>
export type TipoProdutoFilters = Pick<
  z.output<typeof listTiposProdutoSchema>,
  "nome"
>
export type Pagination = { page: number; limit: number }

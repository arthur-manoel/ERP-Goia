import { z } from "zod"

const positiveId = z.number().int().positive().max(2_147_483_647)
const nome = z
  .string()
  .trim()
  .min(1, "Nome obrigatório.")
  .max(50, "Nome deve ter no máximo 50 caracteres.")
const status = z.enum(["ATIVO", "INATIVO"])
const fields = {
  id_empresa: positiveId,
  nome,
  descricao: z.string().trim().max(255).nullable().optional(),
  ordem: z.number().int().min(-2_147_483_648).max(2_147_483_647),
  status,
}

export const createTamanhoSchema = z
  .object({
    ...fields,
    ordem: fields.ordem.default(0),
    status: status.default("ATIVO"),
  })
  .strict()
export const updateTamanhoSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe pelo menos um campo para atualizar. id não pode ser alterado.",
  )
export const tamanhoIdSchema = z
  .string()
  .regex(/^\d+$/, "ID deve ser um inteiro positivo.")
  .transform(Number)
  .pipe(positiveId)
export const listTamanhosSchema = z
  .object({
    busca: z.string().trim().max(255).optional(),
    page: tamanhoIdSchema.default(1),
    limit: tamanhoIdSchema.pipe(z.number().max(100)).default(20),
    id_empresa: tamanhoIdSchema.optional(),
    nome: nome.optional(),
    status: status.optional(),
  })
  .strict()

export type CreateTamanhoData = z.output<typeof createTamanhoSchema>
export type UpdateTamanhoData = z.output<typeof updateTamanhoSchema>
export type TamanhoFilters = Pick<
  z.output<typeof listTamanhosSchema>,
  "busca" | "id_empresa" | "nome" | "status"
>
export type Pagination = { page: number; limit: number }

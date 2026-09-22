import { z } from "zod"

const positiveId = z.number().int().positive().max(2_147_483_647)
const nome = z
  .string()
  .trim()
  .min(1, "Nome obrigatório.")
  .max(100, "Nome deve ter no máximo 100 caracteres.")
const status = z.enum(["ATIVA", "INATIVA"])
export const codigoHexSchema = z
  .string()
  .trim()
  .regex(
    /^#[0-9a-fA-F]{6}$/,
    "Código hexadecimal deve usar o formato #RRGGBB, por exemplo #FFFFFF.",
  )
  .transform((value) => value.toUpperCase())
const fields = {
  // A API exige empresa conforme o contrato, mesmo sendo nullable no banco atual.
  id_empresa: positiveId,
  nome,
  codigo_hex: codigoHexSchema.nullable().optional(),
  status,
}
export const createCorSchema = z
  .object({ ...fields, status: status.default("ATIVA") })
  .strict()
export const updateCorSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe pelo menos um campo para atualizar. id não pode ser alterado.",
  )
export const corIdSchema = z
  .string()
  .regex(/^\d+$/, "ID deve ser um inteiro positivo.")
  .transform(Number)
  .pipe(positiveId)
export const listCoresSchema = z
  .object({
    page: corIdSchema.default(1),
    limit: corIdSchema.pipe(z.number().max(100)).default(20),
    id_empresa: corIdSchema.optional(),
    nome: nome.optional(),
    status: status.optional(),
  })
  .strict()
export type CreateCorData = z.output<typeof createCorSchema>
export type UpdateCorData = z.output<typeof updateCorSchema>
export type CorFilters = Pick<
  z.output<typeof listCoresSchema>,
  "id_empresa" | "nome" | "status"
>
export type Pagination = { page: number; limit: number }

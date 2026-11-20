import { z } from "zod"

const id = z.number().int().positive().max(2_147_483_647)
export const cargoIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/)
  .transform(Number)
  .pipe(id)
export const cargoParamsSchema = z.strictObject({ id: cargoIdSchema })
const nome = z.string().trim().min(2).max(100)
const descricao = z.string().trim().min(1).max(255).nullable()
const campos = { nome, descricao, aprova_cancelamento: z.boolean() }
export const createCargoSchema = z.strictObject({
  id_empresa: id,
  ...campos,
  descricao: descricao.default(null),
  aprova_cancelamento: campos.aprova_cancelamento.default(false),
})
export const updateCargoSchema = z.strictObject({
  ...campos,
  descricao: descricao.default(null),
})
export const patchCargoSchema = z
  .strictObject(campos)
  .partial()
  .refine(
    (valor) => Object.keys(valor).length > 0,
    "Informe ao menos um campo.",
  )
const paginacao = {
  page: cargoIdSchema.pipe(z.number().max(1_000_000)).default(1),
  limit: cargoIdSchema.pipe(z.number().max(100)).default(10),
}
export const consultasCargoSchema = z.strictObject(paginacao)
export const cargoFiltersSchema = z.strictObject({
  ...paginacao,
  id: cargoIdSchema.optional(),
  id_empresa: cargoIdSchema.optional(),
  nome: z.string().trim().min(1).max(100).optional(),
  descricao: z.string().trim().min(1).max(255).optional(),
  search: z.string().trim().min(1).max(255).optional(),
  status: z.enum(["ATIVO", "INATIVO"]).optional(),
  aprova_cancelamento: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  sortBy: z
    .enum(["id", "nome", "descricao", "status", "aprova_cancelamento"])
    .default("nome"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
})
export type Filtros = z.output<typeof cargoFiltersSchema>
export type Paginacao = z.output<typeof consultasCargoSchema>
export type Alteracao = z.output<typeof patchCargoSchema>

import { z } from "zod"

export function normalizeNome(value: string) {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim()
}
const positiveId = z.number().int().positive().max(2_147_483_647)
export const localIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "ID deve ser um inteiro positivo.")
  .transform(Number)
  .pipe(positiveId)
export const localStatusSchema = z.enum(["ATIVO", "INATIVO"])

const nome = z
  .string()
  .transform(normalizeNome)
  .pipe(
    z
      .string()
      .min(1, "Nome obrigatório.")
      .max(100, "Nome deve ter no máximo 100 caracteres."),
  )
const descricao = z
  .string()
  .trim()
  .max(255, "Descrição deve ter no máximo 255 caracteres.")
  .nullable()

// `id_empresa` só existe na criação: um local nunca muda de empresa, porque o
// estoque, o kardex e as movimentações apontam para ele dentro da empresa.
export const createLocalSchema = z
  .object({
    id_empresa: positiveId.optional(),
    nome,
    descricao: descricao.optional().default(null),
    status: localStatusSchema.default("ATIVO"),
  })
  .strict()

export const patchLocalSchema = z
  .object({
    nome: nome.optional(),
    descricao: descricao.optional(),
    status: localStatusSchema.optional(),
  })
  .strict()
  .refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    "Informe pelo menos um campo para atualizar. id e id_empresa não podem ser alterados.",
  )

export const listLocaisSchema = z
  .object({
    page: localIdSchema.default(1),
    limit: localIdSchema.pipe(z.number().max(100)).default(20),
    id_empresa: localIdSchema.optional(),
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
    status: localStatusSchema.optional(),
    ordenar_por: z.enum(["id", "nome"]).default("nome"),
    ordem: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict()
  .refine((data) => (data.page - 1) * data.limit <= 2_147_483_647, {
    path: ["page"],
    message: "Paginação excede o limite permitido.",
  })

export type CreateLocalData = z.output<typeof createLocalSchema>
export type PatchLocalData = z.output<typeof patchLocalSchema>
export type LocalFilters = Omit<
  z.output<typeof listLocaisSchema>,
  "page" | "limit"
>
export type Pagination = { page: number; limit: number }

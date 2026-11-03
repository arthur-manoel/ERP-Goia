import { z } from "zod"
import { idSchema } from "./producao.schema"
export const ordemIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(idSchema)
export const ordemParamsSchema = z.object({ id: ordemIdSchema }).strict()
export const itemParamsSchema = z
  .object({ id: ordemIdSchema, itemId: ordemIdSchema })
  .strict()
export const etapaParamsSchema = z
  .object({ id: ordemIdSchema, etapaId: ordemIdSchema })
  .strict()
export const ordemStatusSchema = z.enum([
  "PLANEJADA",
  "LIBERADA",
  "EM_PRODUCAO",
  "PAUSADA",
  "CONCLUIDA",
  "CANCELADA",
])
export const prioridadeSchema = z.enum(["BAIXA", "NORMAL", "ALTA", "URGENTE"])
export const decimalSchema = z
  .union([
    z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/),
    z.number().finite().nonnegative(),
  ])
  .transform(String)
  .refine(
    (value) => /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(value),
    "Quantidade fora de Decimal(15,3).",
  )
const dateSchema = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((value) => new Date(value))
  .refine(
    (value) => value.getUTCFullYear() >= 1000 && value.getUTCFullYear() <= 9999,
    "Data fora do intervalo suportado.",
  )
const endDateSchema = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((value) =>
    value.length === 10 ? `${value}T23:59:59.999Z` : value,
  )
  .pipe(dateSchema)
const fields = {
  numero: z.string().trim().min(1).max(50),
  id_pedido_cliente: idSchema.nullable().optional(),
  id_local_estoque: idSchema.nullable().optional(),
  id_setor: idSchema.nullable().optional(),
  quantidade_planejada: decimalSchema,
  prioridade: prioridadeSchema,
  data_inicio: dateSchema.nullable().optional(),
  data_previsao: dateSchema.nullable().optional(),
  observacao: z.string().trim().max(255).nullable().optional(),
}
const complete = {
  ...fields,
  id_pedido_cliente: fields.id_pedido_cliente.default(null),
  id_local_estoque: fields.id_local_estoque.default(null),
  id_setor: fields.id_setor.default(null),
  quantidade_planejada: decimalSchema.default("0"),
  prioridade: prioridadeSchema.default("NORMAL"),
  data_inicio: fields.data_inicio.default(null),
  data_previsao: fields.data_previsao.default(null),
  observacao: fields.observacao.default(null),
}
export const createOrdemSchema = z
  .object({ ...complete, id_empresa: idSchema.optional() })
  .strict()
export const updateOrdemSchema = z
  .object({
    ...complete,
    quantidade_planejada: decimalSchema,
    prioridade: prioridadeSchema,
  })
  .strict()
export const patchOrdemSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine(
    (value) => Object.values(value).some((v) => v !== undefined),
    "Informe campos para atualizar.",
  )
const pagination = {
  page: ordemIdSchema.default(1),
  limit: ordemIdSchema.pipe(z.number().max(100)).default(20),
}
export const ordemPaginationSchema = z
  .object(pagination)
  .strict()
  .refine(
    (v) => (v.page - 1) * v.limit <= 2_147_483_647,
    "Paginação excede o limite.",
  )
export const listOrdemSchema = z
  .object({
    ...pagination,
    id_empresa: ordemIdSchema.optional(),
    id_pedido_cliente: ordemIdSchema.optional(),
    id_local_estoque: ordemIdSchema.optional(),
    id_setor: ordemIdSchema.optional(),
    id_usuario: ordemIdSchema.optional(),
    status: ordemStatusSchema.optional(),
    prioridade: prioridadeSchema.optional(),
    numero: z.string().trim().max(50).optional(),
    busca: z.string().trim().max(50).optional(),
    data_inicio_de: dateSchema.optional(),
    data_inicio_ate: endDateSchema.optional(),
    data_previsao_de: dateSchema.optional(),
    data_previsao_ate: endDateSchema.optional(),
    data_conclusao_de: dateSchema.optional(),
    data_conclusao_ate: endDateSchema.optional(),
    ordenar_por: z
      .enum([
        "id",
        "numero",
        "prioridade",
        "data_inicio",
        "data_previsao",
        "data_conclusao",
      ])
      .default("id"),
    ordem: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.page - 1) * v.limit > 2_147_483_647)
      ctx.addIssue({
        code: "custom",
        message: "Paginação excede o limite.",
        path: ["page"],
      })
    for (const field of [
      "data_inicio",
      "data_previsao",
      "data_conclusao",
    ] as const)
      if (
        v[`${field}_de`] &&
        v[`${field}_ate`] &&
        v[`${field}_de`]! > v[`${field}_ate`]!
      )
        ctx.addIssue({
          code: "custom",
          message: "Período inválido.",
          path: [`${field}_ate`],
        })
  })
export const ordemItemSchema = z
  .object({
    id_produto: idSchema,
    id_variacao: idSchema.optional(),
    quantidade: decimalSchema.refine((v) => Number(v) > 0),
    tamanho: z.string().trim().min(1).max(30).default("UNICO"),
  })
  .strict()
export const patchItemSchema = ordemItemSchema
  .pick({ quantidade: true, tamanho: true })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Informe quantidade ou tamanho.")
export const apontarSchema = z
  .object({
    quantidade_produzida: decimalSchema,
    quantidade_esperada: decimalSchema,
  })
  .strict()
export type OrdemInput = z.output<typeof createOrdemSchema>
export type OrdemFilters = Omit<
  z.output<typeof listOrdemSchema>,
  "page" | "limit"
>
export type Pagination = z.output<typeof ordemPaginationSchema>

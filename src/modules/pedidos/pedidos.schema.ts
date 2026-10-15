import "server-only"
import { z } from "zod"
import { Prisma, pedido_cliente_status } from "@/generated/prisma/client"

export const MAX_ITENS = 100
export const idSchema = z.number().int().positive().max(2147483647)
export const idRotaSchema = z
  .string()
  .max(10)
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(idSchema)
export const quantidadeSchema = z
  .string()
  .max(16)
  .regex(/^(0|[1-9]\d{0,11})(\.\d{1,3})?$/)
  .pipe(
    z
      .string()
      .refine(
        (v) => new Prisma.Decimal(v).gt(0),
        "Quantidade deve ser positiva.",
      )
      .transform((v) => new Prisma.Decimal(v).toFixed(3)),
  )
export const precoSchema = z
  .string()
  .max(16)
  .regex(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/)
  .transform((v) => new Prisma.Decimal(v).toFixed(2))
export const dataCivilSchema = z
  .string()
  .regex(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v + "T00:00:00.000Z")
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
  }, "Data civil inválida; use YYYY-MM-DD.")
export const chaveSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
export const versaoHeaderSchema = z
  .string()
  .regex(/^"[1-9]\d{0,9}"$/)
  .transform((v) => Number(v.slice(1, -1)))
  .pipe(idSchema)

export const itemSchema = z.strictObject({
  idProduto: idSchema,
  idVariacao: idSchema.nullable().optional().default(null),
  quantidade: quantidadeSchema,
  precoPraticado: precoSchema,
})
export const criarSchema = z
  .strictObject({
    idCliente: idSchema,
    dataEntregaPrevista: dataCivilSchema,
    observacao: z.string().trim().max(2000).nullable().optional().default(null),
    itens: z.array(itemSchema).min(1).max(MAX_ITENS),
  })
  .superRefine((v, ctx) => {
    const chaves = new Set<string>()
    v.itens.forEach((item, i) => {
      const chave = `${item.idProduto}:${item.idVariacao ?? "SEM_VARIACAO"}`
      if (chaves.has(chave))
        ctx.addIssue({
          code: "custom",
          path: ["itens", i],
          message: "Produto/variação repetido no pedido.",
        })
      chaves.add(chave)
    })
  })
export const editarSchema = z
  .strictObject({
    idCliente: idSchema.optional(),
    dataEntregaPrevista: dataCivilSchema.optional(),
    observacao: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Informe ao menos um campo.")
export const editarItemSchema = z
  .strictObject({
    idProduto: idSchema.optional(),
    idVariacao: idSchema.nullable().optional(),
    quantidade: quantidadeSchema.optional(),
    precoPraticado: precoSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Informe ao menos um campo.")
export const listarSchema = z
  .strictObject({
    idCliente: idRotaSchema.optional(),
    status: z.enum(pedido_cliente_status).optional(),
    busca: z.string().trim().max(100).optional(),
    dataInicio: dataCivilSchema.optional(),
    dataFim: dataCivilSchema.optional(),
    pagina: idRotaSchema.optional().default(1),
    limite: idRotaSchema.pipe(z.number().max(100)).optional().default(25),
  })
  .refine(
    (v) => !v.dataInicio || !v.dataFim || v.dataInicio <= v.dataFim,
    "Intervalo de datas inválido.",
  )
export type CriarInput = z.infer<typeof criarSchema>
export type ItemInput = z.infer<typeof itemSchema>
export type EditarInput = z.infer<typeof editarSchema>
export type EditarItemInput = z.infer<typeof editarItemSchema>
export type ListarInput = z.infer<typeof listarSchema>

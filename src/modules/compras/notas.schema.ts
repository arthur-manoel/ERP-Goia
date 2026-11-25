import { z } from "zod"
import { idSchema, quantidadeSchema, valorSchema } from "./compras.schema"
const id = idSchema.nullable().optional()
export const itemNotaSchema = z.strictObject({
  id: idSchema.optional(),
  numeroItem: z.number().int().min(1).max(2147483647),
  codigo: z.string().trim().max(100).nullable().optional(),
  descricao: z.string().trim().max(255).nullable().optional(),
  idProduto: id,
  idCompraItem: id,
  idVariacao: id,
  idLocalEstoque: id,
  idSetor: id,
  quantidade: quantidadeSchema,
  unidade: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .transform((s) => s.toUpperCase()),
  tipoValor: z.enum(["UNITARIO", "METRO", "TOTAL"]),
  valorUnitario: valorSchema,
  valorTotal: valorSchema,
})
export const itensNotaSchema = z
  .array(itemNotaSchema)
  .max(200)
  .refine(
    (a) => new Set(a.map((i) => i.numeroItem)).size === a.length,
    "Número de item fiscal repetido.",
  )
  .refine(
    (a) =>
      new Set(a.flatMap((i) => (i.id ? [i.id] : []))).size ===
      a.filter((i) => i.id).length,
    "ID de linha repetido.",
  )
export const conferenciaNotaSchema = z.strictObject({
  versaoEsperada: z.number().int().positive().max(2147483647),
  itens: itensNotaSchema,
  justificativaValores: z.string().trim().min(1).max(255).nullable().optional(),
})
export const processarNotaSchema = z.strictObject({
  versaoEsperada: z.number().int().positive().max(2147483647),
  linhas: z
    .array(
      z.strictObject({
        idItem: idSchema,
        novaQuantidade: z
          .union([
            quantidadeSchema,
            z.literal("0"),
            z.literal("0.0"),
            z.literal("0.00"),
            z.literal("0.000"),
          ])
          .default("0"),
        recebimentos: z
          .array(
            z.strictObject({
              idMovimentacao: idSchema,
              quantidade: quantidadeSchema,
            }),
          )
          .max(200)
          .default([]),
      }),
    )
    .min(1)
    .max(200)
    .refine(
      (a) => new Set(a.map((i) => i.idItem)).size === a.length,
      "Linha fiscal repetida.",
    ),
})
export type LinhaNota = z.output<typeof itemNotaSchema>
export type ConferenciaNota = z.output<typeof conferenciaNotaSchema>
export type ProcessamentoNota = z.output<typeof processarNotaSchema>

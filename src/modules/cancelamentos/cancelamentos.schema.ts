import { z } from "zod"
import {
  dataRecebimento,
  idRecebimento,
  recebimentoSchema,
} from "@/modules/recebimentos/recebimentos.schema"
export const id = idRecebimento
export const motivo = z
  .string()
  .trim()
  .min(5, "Descreva o motivo com pelo menos 5 caracteres.")
  .max(255)
export const escopo = z
  .strictObject({
    tipo: z.enum(["PEDIDO", "ENTREGA", "FECHAMENTO"]),
    idEntrega: id.optional(),
  })
  .refine(
    (v) =>
      v.tipo === "ENTREGA"
        ? v.idEntrega !== undefined
        : v.idEntrega === undefined,
    "Informe entrega somente para estorno de entrega.",
  )
export const previaSchema = z
  .strictObject({
    tipo: z.enum(["PEDIDO", "ENTREGA", "FECHAMENTO"]),
    idEntrega: z
      .string()
      .regex(/^[1-9]\d{0,9}$/)
      .transform(Number)
      .pipe(id)
      .optional(),
  })
  .refine(
    (v) =>
      v.tipo === "ENTREGA"
        ? v.idEntrega !== undefined
        : v.idEntrega === undefined,
    "Selecione uma entrega para esse estorno.",
  )
export const solicitarSchema = z
  .strictObject({
    tipo: z.enum(["PEDIDO", "ENTREGA", "FECHAMENTO"]),
    idEntrega: id.optional(),
    motivo,
    hashEstado: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .refine(
    (v) =>
      v.tipo === "ENTREGA"
        ? v.idEntrega !== undefined
        : v.idEntrega === undefined,
    "Informe entrega somente para estorno de entrega.",
  )
export const decisaoSchema = z.strictObject({
  decisao: z.enum(["APROVADA", "REJEITADA"]),
  motivo,
})
export const vazioSchema = z.strictObject({})
export const reavaliarSchema = z.strictObject({
  hashEstado: z.string().regex(/^[a-f0-9]{64}$/),
  motivo,
})
const quantidade = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/)
  .refine((v) => /[1-9]/.test(v), "Informe quantidade positiva.")
const destino = { idLocalEstoque: id.optional(), idSetor: id.optional() }
export const devolucaoSchema = z
  .strictObject({
    idLinha: id,
    quantidade,
    condicao: z.enum(["APROVEITAVEL", "AVARIADA"]),
    observacao: motivo,
    ...destino,
  })
  .refine(
    (v) =>
      v.condicao === "AVARIADA"
        ? v.idLocalEstoque === undefined && v.idSetor === undefined
        : v.idLocalEstoque !== undefined && v.idSetor !== undefined,
    "Informe local e setor apenas para peças aprovadas para estoque.",
  )
export const destinacaoSchema = z.strictObject({
  idRecebimento: id,
  quantidade,
  tratamento: z.enum(["ESTOQUE", "DESCARTE"]),
  motivo,
  idLocalEstoque: id,
  idSetor: id,
})
export const reembolsoSchema = recebimentoSchema
  .omit({ formaPagamento: true })
  .extend({ idCredito: id, data: dataRecebimento })
export const paginaSchema = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(1000000).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(25),
})
export type Escopo = z.infer<typeof escopo>
export type Solicitar = z.infer<typeof solicitarSchema>

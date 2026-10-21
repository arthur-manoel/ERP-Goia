import "server-only"
import { createHash } from "node:crypto"
import { z } from "zod"
import { Prisma } from "@/generated/prisma/client"
import { PedidoError } from "@/modules/pedidos/pedidos.error"
import type { Pedido } from "@/modules/pedidos/pedidos.repository"
import { idSchema } from "@/modules/pedidos/pedidos.schema"
import { fecharSchema, MAX_PARCELAS } from "./recebiveis.schema"

const valorSchema = z
  .string()
  .max(16)
  .regex(/^(0|[1-9]\d{0,12})\.\d{2}$/)
const quantidadeSchema = z
  .string()
  .max(16)
  .regex(/^(0|[1-9]\d{0,11})\.\d{3}$/)
  .pipe(z.string().refine((valor) => new Prisma.Decimal(valor).gt(0)))
const percentualSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,2})\.\d{2}$/)
  .pipe(z.string().refine((valor) => new Prisma.Decimal(valor).lte(100)))

const itemSnapshotSchema = z.strictObject({
  idItem: idSchema,
  idProduto: idSchema,
  idVariacao: idSchema.nullable(),
  idCor: idSchema.nullable(),
  idTamanho: idSchema.nullable(),
  codigo: z.string().max(100).nullable(),
  descricao: z.string().max(255),
  unidade: z.string().max(20),
  quantidade: quantidadeSchema,
  precoPraticado: valorSchema,
  desconto: valorSchema,
  acrescimo: valorSchema,
  subtotal: valorSchema,
})
export const snapshotSchema = z.strictObject({
  idPedido: idSchema,
  idEmpresa: idSchema,
  idCliente: idSchema,
  idCondicaoPagamento: idSchema.nullable(),
  subtotal: valorSchema,
  desconto: valorSchema,
  frete: valorSchema,
  acrescimo: valorSchema,
  total: valorSchema,
  itens: z.array(itemSnapshotSchema).min(1),
})
export const planoPersistidoSchema = fecharSchema.extend({
  condicaoPagamento: z
    .strictObject({
      id: idSchema,
      numeroParcelas: z.number().int().min(1).max(MAX_PARCELAS),
      intervaloDias: z.number().int().min(0).max(2147483647),
      permiteParcelamento: z.boolean(),
      descontoPercentual: percentualSchema,
    })
    .nullable(),
})
export type SnapshotPedido = z.infer<typeof snapshotSchema>
export type PlanoPersistido = z.infer<typeof planoPersistidoSchema>

export function snapshotPedido(pedido: Pedido): SnapshotPedido {
  return {
    idPedido: pedido.id,
    idEmpresa: pedido.id_empresa,
    idCliente: pedido.id_cliente,
    idCondicaoPagamento: pedido.id_condicao_pagamento,
    subtotal: pedido.valor_subtotal.toFixed(2),
    desconto: pedido.valor_desconto.toFixed(2),
    frete: pedido.valor_frete.toFixed(2),
    acrescimo: pedido.valor_acrescimo.toFixed(2),
    total: pedido.valor_total.toFixed(2),
    itens: [...pedido.pedido_cliente_item]
      .sort((a, b) => a.id - b.id)
      .map((item) => ({
        idItem: item.id,
        idProduto: item.id_produto,
        idVariacao: item.id_variacao,
        idCor: item.id_cor,
        idTamanho: item.id_tamanho,
        codigo: item.codigo_produto,
        descricao: item.descricao,
        unidade: item.unidade,
        quantidade: item.quantidade.toFixed(3),
        precoPraticado: item.valor_unitario.toFixed(2),
        desconto: item.valor_desconto.toFixed(2),
        acrescimo: item.valor_acrescimo.toFixed(2),
        subtotal: item.valor_total.toFixed(2),
      })),
  }
}

export function canonical(value: unknown): string {
  const vistos = new WeakSet<object>()
  const invalido = () =>
    new PedidoError(409, "Snapshot financeiro inválido; requer regularização.")
  function serializar(atual: unknown): string {
    if (atual === null) return "null"
    if (typeof atual === "string" || typeof atual === "boolean")
      return JSON.stringify(atual)
    if (typeof atual === "number") {
      if (!Number.isFinite(atual)) throw invalido()
      return JSON.stringify(atual)
    }
    if (typeof atual !== "object" || vistos.has(atual)) throw invalido()
    const prototype = Object.getPrototypeOf(atual)
    if (
      !Array.isArray(atual) &&
      prototype !== null &&
      prototype !== Object.prototype
    )
      throw invalido()
    vistos.add(atual)
    try {
      if (Array.isArray(atual))
        return `[${Array.from(atual, serializar).join(",")}]`
      return `{${Object.keys(atual)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${serializar((atual as Record<string, unknown>)[key])}`,
        )
        .join(",")}}`
    } finally {
      vistos.delete(atual)
    }
  }
  return serializar(value)
}
export const hash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex")

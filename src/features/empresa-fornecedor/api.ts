import { z } from "zod"
import { mensagemErro } from "@/features/autenticacao/provedor-autenticacao"
import {
  createSchema,
  patchSchema,
  type PatchInput,
} from "@/modules/empresa-fornecedor/schema"

const supplier = z.object({
  id: z.number(),
  id_empresa: z.number().nullable(),
  razao_social: z.string(),
  nome_fantasia: z.string().nullable(),
  cnpj: z.string().nullable(),
  status: z.enum(["ATIVO", "INATIVO"]),
})
const conditions = z.object({
  id: z.number(),
  prazo_pagamento: z.number().nullable(),
  prazo_entrega: z.number().nullable(),
  observacao: z.string().nullable(),
  status: z.enum(["ATIVO", "INATIVO"]),
})
const association = conditions.extend({
  id_empresa: z.number(),
  id_fornecedor: z.number(),
  fornecedores: supplier,
})
const available = supplier.extend({ empresa_fornecedor: z.array(conditions) })
const page = {
  count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
}
export type Association = z.infer<typeof association>
export type Supplier = z.infer<typeof supplier>
export type Row = {
  fornecedor: Supplier
  associacao: z.infer<typeof conditions> | null
}
export type Page = {
  rows: Row[]
  count: number
  page: number
  limit: number
  totalPages: number
}
export type Requisitar = (url: string, init?: RequestInit) => Promise<Response>
export type Tab = "ASSOCIADOS" | "ESPECIFICO" | "GLOBAL_DISPONIVEL"
export const base = "/api/empresa-fornecedor"
export function listUrl(tab: Tab, busca: string, status: string, page: number) {
  const query = new URLSearchParams({ page: String(page), limit: "10" })
  if (busca.trim()) query.set("busca", busca.trim())
  if (tab === "ASSOCIADOS" && status) query.set("status", status)
  if (tab !== "ASSOCIADOS") query.set("tipo", tab)
  return `${base}${tab === "ASSOCIADOS" ? "" : "/fornecedores"}?${query}`
}
async function json(request: Requisitar, url: string, init?: RequestInit) {
  const response = await request(url, init)
  if (!response.ok) throw new Error(await mensagemErro(response))
  const body = z
    .object({ success: z.literal(true), data: z.unknown() })
    .safeParse(await response.json())
  if (!body.success) throw new Error("Resposta inválida do servidor.")
  return body.data.data
}
export async function list(
  request: Requisitar,
  url: string,
  tab: Tab,
  signal: AbortSignal,
): Promise<Page> {
  const data = await json(request, url, { signal })
  if (tab === "ASSOCIADOS") {
    const result = z.object({ ...page, rows: z.array(association) }).parse(data)
    return {
      ...result,
      rows: result.rows.map((row) => ({
        fornecedor: row.fornecedores,
        associacao: row,
      })),
    }
  }
  const result = z.object({ ...page, rows: z.array(available) }).parse(data)
  return {
    ...result,
    rows: result.rows.map((row) => ({
      fornecedor: row,
      associacao: row.empresa_fornecedor[0] ?? null,
    })),
  }
}
export async function save(
  request: Requisitar,
  row: Row,
  data: PatchInput,
  editing: boolean,
) {
  const id = row.associacao?.id
  if (editing && id === undefined)
    throw new Error("Associação não encontrada. Recarregue a lista.")
  const input = editing
    ? patchSchema.parse(data)
    : createSchema.parse({ ...data, id_fornecedor: row.fornecedor.id })
  return association.parse(
    await json(request, editing ? `${base}/${id}` : base, {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  )
}
export async function inactivate(request: Requisitar, id: number) {
  return association.parse(
    await json(request, `${base}/${id}`, { method: "DELETE" }),
  )
}
export function formDays(value: string): number | null {
  if (!value.trim()) return null
  if (!/^\d+$/.test(value))
    throw new Error("Os prazos devem ser dias inteiros não negativos.")
  const days = Number(value)
  if (!Number.isSafeInteger(days) || days > 2_147_483_647)
    throw new Error("Prazo fora do limite permitido.")
  return days
}
export function stateOfPage(
  loading: boolean,
  error: string | null,
  count: number,
) {
  return loading ? "loading" : error ? "error" : count === 0 ? "empty" : "ready"
}

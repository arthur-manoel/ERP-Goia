"use client"

import { z } from "zod"
import { mensagemErro } from "@/features/autenticacao/provedor-autenticacao"

export type RequisitarProdutos = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

export const opcaoCatalogoSchema = z.object({
  id: z.number().int().positive(),
  nome: z.string(),
  status: z.string(),
})

export type OpcaoCatalogo = z.infer<typeof opcaoCatalogoSchema>

export async function listarCatalogoProduto(
  requisitar: RequisitarProdutos,
  rota: string,
  idEmpresa: number,
  signal: AbortSignal,
) {
  const registros: OpcaoCatalogo[] = []
  let totalPaginas = 1
  for (let page = 1; page <= totalPaginas; page++) {
    const query = new URLSearchParams({
      id_empresa: String(idEmpresa),
      page: String(page),
      limit: "100",
    })
    const resposta = await requisitar(`${rota}?${query}`, {
      signal,
      headers: { "X-Empresa-Id": String(idEmpresa) },
    })
    if (!resposta.ok) throw new Error(await mensagemErro(resposta))
    const resultado = z
      .object({
        data: z.object({
          rows: z.array(opcaoCatalogoSchema),
          totalPages: z.number().int().nonnegative(),
        }),
      })
      .safeParse(await resposta.json())
    if (!resultado.success) throw new Error("Resposta do catálogo inválida.")
    const corpo = resultado.data
    registros.push(...corpo.data.rows)
    totalPaginas = corpo.data.totalPages
  }
  return registros
}

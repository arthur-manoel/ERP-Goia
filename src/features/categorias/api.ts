import { z } from "zod"
import type { Categoria, DadosCategoria } from "./tipos"

export type RequisitarCategorias = (
  url: string,
  init?: RequestInit,
) => Promise<Response>

const categoriaSchema = z.object({
  id: z.number().int().positive(),
  id_empresa: z.number().int().positive(),
  nome: z.string(),
  descricao: z.string().nullable(),
  status: z.enum(["ATIVA", "INATIVA"]),
})
const paginaSchema = z.object({
  rows: z.array(categoriaSchema),
  count: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
})

async function lerResposta(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(
      typeof body?.error === "string"
        ? body.error
        : `Falha na requisição (${response.status}).`,
    )
  }
  if (body?.success !== true)
    throw new Error("Resposta de categorias inválida.")
  return body.data
}

export async function listarCategorias(
  requisitar: RequisitarCategorias,
  idEmpresa: number,
  filtros: { busca: string; status: string; pagina: number },
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({
    id_empresa: String(idEmpresa),
    page: String(filtros.pagina),
    limit: "10",
    ordenar_por: "nome",
    ordem: "asc",
  })
  if (filtros.busca.trim()) query.set("busca", filtros.busca.trim())
  if (filtros.status !== "todas") query.set("status", filtros.status)
  const data = paginaSchema.parse(
    await lerResposta(await requisitar(`/api/categorias?${query}`, { signal })),
  )
  if (data.rows.some((item) => item.id_empresa !== idEmpresa))
    throw new Error("A resposta contém categorias de outra empresa.")
  return data
}

export async function salvarCategoria(
  requisitar: RequisitarCategorias,
  idEmpresa: number,
  dados: DadosCategoria,
  categoria?: Categoria,
) {
  if (categoria && categoria.id_empresa !== idEmpresa)
    throw new Error("Categoria não pertence à empresa selecionada.")
  const response = await requisitar(
    categoria ? `/api/categorias/${categoria.id}` : "/api/categorias",
    {
      method: categoria ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        categoria ? dados : { ...dados, id_empresa: idEmpresa },
      ),
    },
  )
  const salva = categoriaSchema.parse(await lerResposta(response))
  if (
    salva.id_empresa !== idEmpresa ||
    (categoria && salva.id !== categoria.id)
  )
    throw new Error("Resposta de categorias inválida.")
  return salva
}

export async function alterarStatusCategoria(
  requisitar: RequisitarCategorias,
  idEmpresa: number,
  categoria: Categoria,
) {
  if (categoria.id_empresa !== idEmpresa)
    throw new Error("Categoria não pertence à empresa selecionada.")
  await lerResposta(
    await requisitar(`/api/categorias/${categoria.id}`, {
      method: categoria.status === "ATIVA" ? "DELETE" : "PATCH",
      ...(categoria.status === "INATIVA"
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "ATIVA" }),
          }
        : {}),
    }),
  )
}

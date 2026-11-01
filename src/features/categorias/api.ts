import { z } from "zod"
import {
  createCategoriaSchema,
  patchCategoriaSchema,
  listCategoriasSchema,
} from "../../../modules/categorias/schema"
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

function validarResposta<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) throw new Error("Resposta de categorias inválida.")
  return result.data
}

function headersEmpresa(idEmpresa: number) {
  z.number().int().positive().max(2_147_483_647).parse(idEmpresa)
  return { "X-Empresa-Id": String(idEmpresa) }
}

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
  const filtrosValidados = listCategoriasSchema.parse({
    page: String(filtros.pagina),
    limit: "10",
    busca: filtros.busca || undefined,
    status: filtros.status === "todas" ? undefined : filtros.status,
  })
  const query = new URLSearchParams({
    page: String(filtros.pagina),
    limit: "10",
    ordenar_por: "nome",
    ordem: "asc",
  })
  if (filtrosValidados.busca) query.set("busca", filtrosValidados.busca)
  if (filtrosValidados.status) query.set("status", filtrosValidados.status)
  const data = validarResposta(
    paginaSchema,
    await lerResposta(
      await requisitar(`/api/categorias?${query}`, {
        signal,
        headers: headersEmpresa(idEmpresa),
      }),
    ),
  )
  if (data.rows.some((item) => item.id_empresa !== idEmpresa))
    throw new Error("A resposta contém categorias de outra empresa.")
  if (
    data.page !== filtros.pagina ||
    data.limit !== 10 ||
    data.rows.length > data.limit ||
    data.totalPages !== Math.ceil(data.count / data.limit)
  )
    throw new Error("Resposta de paginação inválida.")
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
  const campos = { nome: dados.nome, descricao: dados.descricao }
  const payload = categoria
    ? patchCategoriaSchema.parse(campos)
    : createCategoriaSchema.parse(campos)
  const response = await requisitar(
    categoria ? `/api/categorias/${categoria.id}` : "/api/categorias",
    {
      method: categoria ? "PATCH" : "POST",
      headers: {
        ...headersEmpresa(idEmpresa),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  )
  const salva = validarResposta(categoriaSchema, await lerResposta(response))
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
  const data = await lerResposta(
    await requisitar(`/api/categorias/${categoria.id}`, {
      method: categoria.status === "ATIVA" ? "DELETE" : "PATCH",
      headers: {
        ...headersEmpresa(idEmpresa),
        ...(categoria.status === "INATIVA"
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(categoria.status === "INATIVA"
        ? {
            body: JSON.stringify({ status: "ATIVA" }),
          }
        : {}),
    }),
  )
  if (categoria.status === "INATIVA") {
    const salva = validarResposta(categoriaSchema, data)
    if (
      salva.id !== categoria.id ||
      salva.id_empresa !== idEmpresa ||
      salva.status !== "ATIVA"
    )
      throw new Error("Resposta de categorias inválida.")
  } else {
    validarResposta(
      z.object({
        message: z.string(),
        produtos_vinculados: z.number().int().nonnegative(),
      }),
      data,
    )
  }
}

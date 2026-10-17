import "server-only"
import {
  autorizarEstoque,
  empresasParaEstoque,
} from "./estoque-minimo.authorization"
import { EstoqueMinimoError } from "./estoque-minimo.error"
import { listarPosicoes, salvarMinimoLocal } from "./estoque-minimo.repository"
import { configurarMinimoSchema } from "./estoque-minimo.schema"
import { montarIndicadorEstoque } from "@/lib/dashboard/estoque"

const noStore = { "Cache-Control": "no-store" }

function falha(error: unknown): Response {
  if (error instanceof EstoqueMinimoError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: noStore },
    )
  console.error("Falha na API de estoque mínimo", error)
  return Response.json(
    { error: "Não foi possível processar o estoque mínimo." },
    { status: 500, headers: noStore },
  )
}

export async function empresasHandler(request: Request) {
  try {
    const resultado = await empresasParaEstoque(request)
    if (resultado instanceof Response) return resultado
    return Response.json(resultado, { headers: noStore })
  } catch (error) {
    return falha(error)
  }
}

export async function listarHandler(request: Request) {
  try {
    const contexto = await autorizarEstoque(request, "ler")
    if (contexto instanceof Response) return contexto
    const params = new URL(request.url).searchParams
    if (
      [...params.keys()].some((key) => key !== "somenteInsumos") ||
      params.getAll("somenteInsumos").length > 1 ||
      (params.has("somenteInsumos") &&
        !["true", "false"].includes(params.get("somenteInsumos") ?? ""))
    )
      throw new EstoqueMinimoError(400, "Filtro de estoque inválido.")
    const posicoes = await listarPosicoes(
      contexto,
      params.get("somenteInsumos") === "true",
    )
    return Response.json(
      {
        posicoes,
        podeEditar: contexto.podeEditar,
        indicador: montarIndicadorEstoque(posicoes),
      },
      { headers: noStore },
    )
  } catch (error) {
    return falha(error)
  }
}

export async function configurarHandler(request: Request) {
  try {
    const contexto = await autorizarEstoque(request, "editar")
    if (contexto instanceof Response) return contexto
    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new EstoqueMinimoError(400, "JSON inválido.")
    }
    const dados = configurarMinimoSchema.safeParse(body)
    if (!dados.success)
      throw new EstoqueMinimoError(
        400,
        dados.error.issues[0]?.message ?? "Dados inválidos.",
      )
    const configuracao = await salvarMinimoLocal(contexto, dados.data)
    return Response.json({ configuracao }, { headers: noStore })
  } catch (error) {
    return falha(error)
  }
}

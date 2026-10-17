import "server-only"
import { autorizarEstoque } from "@/modules/estoque-minimo/estoque-minimo.authorization"
import { EstoqueMinimoError } from "@/modules/estoque-minimo/estoque-minimo.error"
import { EstoqueError } from "./estoque.error"
import {
  criarVinculoEstoque,
  detalharEstoque,
  listarEstoque,
} from "./estoque.repository"
import {
  criarVinculoSchema,
  idEstoqueSchema,
  validarFiltros,
} from "./estoque.schema"

const headers = { "Cache-Control": "private, no-store" }

function recusa(response: Response) {
  response.headers.set("Cache-Control", headers["Cache-Control"])
  return response
}

function falha(error: unknown) {
  if (error instanceof EstoqueError || error instanceof EstoqueMinimoError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers },
    )
  // Exceções do driver podem carregar SQL, parâmetros e credenciais.
  console.error("Falha na API de posições de estoque.")
  return Response.json(
    { error: "Não foi possível processar o estoque." },
    { status: 500, headers },
  )
}

function exigirSemQuery(request: Request) {
  if (new URL(request.url).searchParams.size > 0)
    throw new EstoqueError(
      400,
      "Esta operação não aceita parâmetros de consulta.",
    )
}

export async function listarEstoqueHandler(request: Request) {
  try {
    const contexto = await autorizarEstoque(request, "ler")
    if (contexto instanceof Response) return recusa(contexto)
    const filtros = validarFiltros(new URL(request.url).searchParams)
    if (!filtros) throw new EstoqueError(400, "Filtros de estoque inválidos.")
    return Response.json(await listarEstoque(contexto.idEmpresa, filtros), {
      headers,
    })
  } catch (error) {
    return falha(error)
  }
}

export async function detalharEstoqueHandler(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const contexto = await autorizarEstoque(request, "ler")
    if (contexto instanceof Response) return recusa(contexto)
    exigirSemQuery(request)
    const id = idEstoqueSchema.safeParse((await context.params).id)
    if (!id.success) throw new EstoqueError(400, "ID de estoque inválido.")
    return Response.json(await detalharEstoque(contexto.idEmpresa, id.data), {
      headers,
    })
  } catch (error) {
    return falha(error)
  }
}

export async function criarVinculoEstoqueHandler(request: Request) {
  try {
    const contexto = await autorizarEstoque(request, "criar")
    if (contexto instanceof Response) return recusa(contexto)
    exigirSemQuery(request)
    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new EstoqueError(400, "JSON inválido.")
    }
    const dados = criarVinculoSchema.safeParse(body)
    if (!dados.success)
      throw new EstoqueError(
        400,
        "Informe somente idProduto, idLocalEstoque e idSetor como inteiros positivos válidos.",
      )
    const resultado = await criarVinculoEstoque(contexto, dados.data)
    return Response.json(resultado, {
      status: resultado.criado ? 201 : 200,
      headers,
    })
  } catch (error) {
    return falha(error)
  }
}

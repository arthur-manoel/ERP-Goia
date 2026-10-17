import "server-only"
import { autorizarEstoque } from "@/modules/estoque-minimo/estoque-minimo.authorization"
import { EstoqueMinimoError } from "@/modules/estoque-minimo/estoque-minimo.error"
import { consultarRelatorio } from "./relatorio-estoque.repository"
import { validarFiltros } from "./relatorio-estoque.schema"

const headers = { "Cache-Control": "private, no-store" }

export async function relatorioEstoqueHandler(request: Request) {
  try {
    const contexto = await autorizarEstoque(request, "ler")
    if (contexto instanceof Response) {
      contexto.headers.set("Cache-Control", headers["Cache-Control"])
      return contexto
    }
    const filtros = validarFiltros(new URL(request.url).searchParams)
    if (!filtros)
      return Response.json(
        { error: "Filtros de relatório inválidos." },
        { status: 400, headers },
      )
    return Response.json(
      await consultarRelatorio(contexto.idEmpresa, filtros),
      { headers },
    )
  } catch (error) {
    if (error instanceof EstoqueMinimoError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    // Erros do driver podem conter SQL e parâmetros: não registrar a exceção bruta.
    console.error("Falha ao consultar relatório de estoque.")
    return Response.json(
      { error: "Não foi possível consultar o relatório de estoque." },
      { status: 500, headers },
    )
  }
}

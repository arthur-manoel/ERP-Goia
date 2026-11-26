import "server-only"
import { autorizar } from "@/modules/producao/producao.authorization"
import { ProducaoError } from "@/modules/producao/producao.repository"
import { consultarRelatorioProducao } from "./relatorio-producao.repository"
import { validarFiltrosRelatorioProducao } from "./relatorio-producao.schema"

const headers = { "Cache-Control": "private, no-store" }

export async function relatorioProducaoHandler(request: Request) {
  try {
    const contexto = await autorizar(request, "ler")
    if (contexto instanceof Response) {
      contexto.headers.set("Cache-Control", headers["Cache-Control"])
      return contexto
    }

    const filtros = validarFiltrosRelatorioProducao(
      new URL(request.url).searchParams,
    )
    if (!filtros)
      return Response.json(
        { error: "Período ou paginação inválidos." },
        { status: 400, headers },
      )

    return Response.json(
      await consultarRelatorioProducao(contexto.idEmpresa, filtros),
      { headers },
    )
  } catch (error) {
    if (error instanceof ProducaoError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )

    // Erros de banco podem conter SQL ou parâmetros; manter o log e a resposta seguros.
    console.error("Falha ao consultar relatório de produção.")
    return Response.json(
      { error: "Não foi possível consultar o relatório de produção." },
      { status: 500, headers },
    )
  }
}

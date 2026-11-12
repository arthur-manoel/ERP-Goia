import "server-only"
import { HttpError } from "@/lib/api/errors"
import { readQuery } from "@/lib/api/http"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { autorizar } from "@/modules/movimentacoes-estoque/movimentacoes-estoque.authorization"
import { validarConsulta } from "./kardex.schema"
import { consultarKardex } from "./kardex.repository"

const headers = { "Cache-Control": "private, no-store" }

export async function listarKardexHandler(request: Request) {
  try {
    const ctx = await autorizar(request, "ler")
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", headers["Cache-Control"])
      return ctx
    }
    enforceRateLimit(
      request,
      { scope: "kardex:read", limit: 120, windowMs: 60000 },
      String(ctx.idUsuario),
    )
    const filtros = validarConsulta(readQuery(request))
    return Response.json(await consultarKardex(ctx, filtros), { headers })
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    console.error("Falha ao consultar o Kardex.")
    return Response.json(
      { error: "Não foi possível consultar o Kardex." },
      { status: 500, headers },
    )
  }
}

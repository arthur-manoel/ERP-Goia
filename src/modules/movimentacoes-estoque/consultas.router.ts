import "server-only"
import { HttpError } from "@/lib/api/errors"
import { readQuery, validate } from "@/lib/api/http"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { validarConsulta } from "@/modules/kardex/kardex.schema"
import { autorizar } from "./movimentacoes-estoque.authorization"
import { buscaCatalogoSchema, consultarCatalogo } from "./catalogo"
import { consultarMovimentos } from "./historico"

async function responder(
  request: Request,
  operacao: "catalogo" | "movimentos",
) {
  const headers = { "Cache-Control": "private, no-store" }
  try {
    const ctx = await autorizar(request, "ler")
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", headers["Cache-Control"])
      return ctx
    }
    enforceRateLimit(
      request,
      { scope: `estoque:${operacao}`, limit: 120, windowMs: 60_000 },
      String(ctx.idUsuario),
    )
    const dados =
      operacao === "catalogo"
        ? await consultarCatalogo(
            ctx,
            validate(buscaCatalogoSchema, readQuery(request)),
          )
        : await consultarMovimentos(ctx, validarConsulta(readQuery(request)))
    return Response.json(dados, { headers })
  } catch (erro) {
    return Response.json(
      {
        error:
          erro instanceof HttpError
            ? erro.message
            : "Não foi possível consultar o estoque.",
      },
      { status: erro instanceof HttpError ? erro.status : 500, headers },
    )
  }
}

export const listarMovimentosHandler = (request: Request) =>
  responder(request, "movimentos")
export const catalogoMovimentosHandler = (request: Request) =>
  responder(request, "catalogo")

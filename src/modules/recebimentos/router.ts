import "server-only"
import { HttpError, ValidationError } from "@/lib/api/errors"
import { readQuery, validate } from "@/lib/api/http"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { lerJson } from "@/modules/movimentacoes-estoque/router"
import { autorizarRecebimento } from "./recebimentos.authorization"
import {
  chaveRecebimento,
  idRecebimento,
  paginaRecebimentosSchema,
  recebimentoSchema,
} from "./recebimentos.schema"
import {
  consultarRecebimentos,
  opcoesRecebimento,
  registrarRecebimento,
} from "./recebimentos.service"

const headers = { "Cache-Control": "private, no-store" }
export async function recebimentosHandler(request: Request, id?: string) {
  try {
    const escrita = request.method === "POST"
    const ctx = await autorizarRecebimento(request, escrita)
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", "private, no-store")
      return ctx
    }
    enforceRateLimit(
      request,
      {
        scope: `recebimentos:${escrita ? "write" : "read"}`,
        limit: escrita ? 30 : 120,
        windowMs: 60000,
      },
      String(ctx.idUsuario),
    )
    if (id === undefined) {
      if (new URL(request.url).search)
        throw new ValidationError("Esta consulta não aceita filtros.")
      return Response.json(
        { success: true, data: await opcoesRecebimento(ctx) },
        { headers },
      )
    }
    if (!/^[1-9]\d{0,9}$/.test(id))
      throw new ValidationError("ID do título inválido.")
    const titulo = validate(idRecebimento, Number(id))
    if (!escrita) {
      const pagina = validate(paginaRecebimentosSchema, readQuery(request))
      return Response.json(
        {
          success: true,
          data: await consultarRecebimentos(
            ctx,
            titulo,
            pagina.pagina,
            pagina.limite,
          ),
        },
        { headers },
      )
    }
    if (new URL(request.url).search)
      throw new ValidationError("O recebimento não aceita filtros.")
    const chave = validate(
      chaveRecebimento,
      request.headers.get("Idempotency-Key"),
    )
    const input = validate(recebimentoSchema, await lerJson(request))
    const data = await registrarRecebimento(ctx, titulo, chave, input)
    return Response.json(
      { success: true, data },
      { status: data.criado ? 201 : 200, headers },
    )
  } catch (erro) {
    if (!(erro instanceof HttpError))
      console.error("Falha na API de recebimentos.")
    return Response.json(
      {
        success: false,
        error:
          erro instanceof HttpError
            ? erro.message
            : "Erro interno do servidor.",
      },
      { status: erro instanceof HttpError ? erro.status : 500, headers },
    )
  }
}

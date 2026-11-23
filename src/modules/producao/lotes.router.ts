import "server-only"
import { z } from "zod"
import { autorizar } from "./producao.authorization"
import { HttpError, ConflitoTransitorio } from "@/lib/api/errors"
import { conflitoPersistencia } from "./producao.errors"
import { lerJson } from "@/modules/movimentacoes-estoque/router"
import { chaveRecebimento } from "@/modules/recebimentos/recebimentos.schema"
import { validate, readQuery } from "@/lib/api/http"
import { envioLote, recebimentoLote } from "./lotes.schema"
import { enviarLote, receberLote, consultarLotes } from "./lotes.service"
const idSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().max(2147483647))
const consulta = z.strictObject({
  pagina: z.coerce.number().int().min(1).max(1000000).default(1),
})
type Context = { params: Promise<{ id: string; mov?: string }> }
export function lotesHandler(tipo: "consultar" | "enviar" | "receber") {
  return async (request: Request, context: Context) => {
    const headers = { "Cache-Control": "private, no-store" }
    try {
      const ctx = await autorizar(
        request,
        tipo === "consultar" ? "ler" : "editar",
      )
      if (ctx instanceof Response) {
        ctx.headers.set("Cache-Control", headers["Cache-Control"])
        return ctx
      }
      const params = await context.params,
        id = validate(idSchema, params.id)
      if (tipo === "consultar")
        return Response.json(
          await consultarLotes(
            ctx,
            id,
            validate(consulta, readQuery(request)).pagina,
          ),
          { headers },
        )
      const chave = validate(
        chaveRecebimento,
        request.headers.get("Idempotency-Key"),
      )
      const body = await lerJson(request)
      const result =
        tipo === "enviar"
          ? await enviarLote(ctx, id, chave, validate(envioLote, body))
          : await receberLote(
              ctx,
              id,
              validate(idSchema, params.mov),
              chave,
              validate(recebimentoLote, body),
            )
      return Response.json(result.dados, {
        status: result.criado ? 201 : 200,
        headers,
      })
    } catch (error) {
      if (error instanceof ConflitoTransitorio)
        return Response.json(
          { error: error.message, code: "CONFLITO_TRANSITORIO" },
          { status: 409, headers },
        )
      if (error instanceof HttpError)
        return Response.json(
          { error: error.message },
          { status: error.status, headers },
        )
      if (conflitoPersistencia(error))
        return Response.json(
          {
            error:
              "Dados alterados por outra operação. Repita a mesma tentativa.",
            code: "CONFLITO_TRANSITORIO",
          },
          { status: 409, headers },
        )
      console.error("Falha na movimentação quantitativa de produção.")
      return Response.json(
        { error: "Não foi possível confirmar a movimentação." },
        { status: 500, headers },
      )
    }
  }
}

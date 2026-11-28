import "server-only"
import { z } from "zod"
import { HttpError } from "@/lib/api/errors"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { lerJson } from "@/modules/movimentacoes-estoque/router"
import { chaveRecebimento } from "@/modules/recebimentos/recebimentos.schema"
import { autorizar } from "./compras.authorization"
import { ComprasError, gravacao } from "./compras.repository"
import { conferenciaNotaSchema, processarNotaSchema } from "./notas.schema"
import { conferirItens, processarEntrada } from "./notas.entrada"
const idSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(2147483647))
function validar<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value)
  if (!r.success)
    throw new ComprasError(
      400,
      r.error.issues[0]?.message ?? "Requisição inválida.",
    )
  return r.data
}
type Context = { params: Promise<{ id: string }> }
export function entradaNotaHandler(operacao: "conferir" | "processar") {
  return async (request: Request, context: Context) => {
    const headers = { "Cache-Control": "private, no-store" }
    try {
      const ctx = await autorizar(request, "notas", "editar")
      if (ctx instanceof Response) {
        ctx.headers.set("Cache-Control", headers["Cache-Control"])
        return ctx
      }
      enforceRateLimit(
        request,
        { scope: "nota:operacao", limit: 30, windowMs: 60000 },
        String(ctx.idUsuario),
      )
      const id = validar(idSchema, (await context.params).id)
      const chave =
        operacao === "processar"
          ? validar(chaveRecebimento, request.headers.get("Idempotency-Key"))
          : null
      const body = await lerJson(request)
      if (operacao === "conferir")
        return Response.json(
          await gravacao(ctx, (tx) =>
            conferirItens(tx, ctx, id, validar(conferenciaNotaSchema, body)),
          ),
          { headers },
        )
      const dados = validar(processarNotaSchema, body)
      const res = await gravacao(
        ctx,
        (tx) => processarEntrada(tx, ctx, id, chave!, dados),
        { repetirDisputa: 2, timeout: 60000 },
      )
      return Response.json(res.dados, { headers })
    } catch (e) {
      if (e instanceof ComprasError || e instanceof HttpError)
        return Response.json(
          { error: e.message },
          { status: e.status, headers },
        )
      console.error("Falha na conferência/entrada de nota fiscal.")
      return Response.json(
        { error: "Não foi possível concluir a operação fiscal." },
        { status: 500, headers },
      )
    }
  }
}

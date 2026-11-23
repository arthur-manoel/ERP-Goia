import { handleRequest, readQuery } from "@/lib/api/http"
import { HttpError } from "@/lib/api/errors"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { autorizarRecebimento } from "@/modules/recebimentos/recebimentos.authorization"
import { consultarResultado } from "@/modules/resultado/service"

export const runtime = "nodejs"

export async function GET(request: Request) {
  return handleRequest(async () => {
    const ctx = await autorizarRecebimento(request, false)
    if (ctx instanceof Response) {
      // Mantém o envelope de erro usado pelas APIs financeiras.
      const { error } = (await ctx.json()) as { error: string }
      throw new HttpError(ctx.status, error)
    }
    enforceRateLimit(
      request,
      { scope: "resultado:read", limit: 120, windowMs: 60_000 },
      String(ctx.idUsuario),
    )
    return consultarResultado(readQuery(request), ctx)
  })
}

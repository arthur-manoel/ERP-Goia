import { handleRequest, readQuery } from "@/lib/api/http"
import { HttpError } from "@/lib/api/errors"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { autorizarRecebimento } from "@/modules/recebimentos/recebimentos.authorization"
import { consultarFluxoCaixa } from "@/modules/fluxo-caixa/service"

export const runtime = "nodejs"

export async function GET(request: Request) {
  return handleRequest(async () => {
    const ctx = await autorizarRecebimento(request, false)
    if (ctx instanceof Response) {
      // Mantém o envelope de erro usado pelas APIs financeiras.
      throw new HttpError(
        ctx.status,
        ctx.status === 401 ? "Não autenticado." : "Acesso negado.",
      )
    }
    enforceRateLimit(
      request,
      { scope: "fluxo-caixa:read", limit: 120, windowMs: 60_000 },
      String(ctx.idUsuario),
    )
    return consultarFluxoCaixa(readQuery(request), ctx)
  })
}

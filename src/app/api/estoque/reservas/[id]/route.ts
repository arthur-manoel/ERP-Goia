import { operacoesHandler } from "@/modules/reservas/router"

export const runtime = "nodejs"

export async function GET(
  request: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  return operacoesHandler(request, "detalhe", (await contexto.params).id)
}

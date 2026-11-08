import { operacoesHandler } from "@/modules/reservas/router"

export const runtime = "nodejs"

export async function POST(
  request: Request,
  contexto: { params: Promise<{ id: string }> },
) {
  return operacoesHandler(request, "entregar", (await contexto.params).id)
}

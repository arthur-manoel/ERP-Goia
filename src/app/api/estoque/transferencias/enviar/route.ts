import { operacoesHandler } from "@/modules/reservas/router"

export const runtime = "nodejs"

export async function POST(request: Request) {
  return operacoesHandler(request, "transferir")
}

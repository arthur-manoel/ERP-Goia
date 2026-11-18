import { operacoesHandler } from "@/modules/reservas/router"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(request: Request) {
  return operacoesHandler(request, "disponibilidade")
}

import { operacoesHandler } from "@/modules/reservas/router"

export const runtime = "nodejs"

export async function GET(request: Request) {
  return operacoesHandler(request, "reservas")
}

export async function POST(request: Request) {
  return operacoesHandler(request, "reservas")
}

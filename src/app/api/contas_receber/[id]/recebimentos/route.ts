import { recebimentosHandler } from "@/modules/recebimentos/router"

export const runtime = "nodejs"
type Contexto = { params: Promise<{ id: string }> }
export async function GET(request: Request, contexto: Contexto) {
  return recebimentosHandler(request, (await contexto.params).id)
}
export async function POST(request: Request, contexto: Contexto) {
  return recebimentosHandler(request, (await contexto.params).id)
}

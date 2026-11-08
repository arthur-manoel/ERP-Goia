import { recebimentosHandler } from "@/modules/recebimentos/router"

export const runtime = "nodejs"
export function GET(request: Request) {
  return recebimentosHandler(request)
}

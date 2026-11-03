import { cancelamentosHandler } from "@/modules/cancelamentos/router"
export const runtime = "nodejs"
export async function POST(request: Request) {
  return cancelamentosHandler(request, "processarNotificacoes")
}

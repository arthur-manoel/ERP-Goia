import { cancelamentosHandler } from "@/modules/cancelamentos/router"
export const runtime = "nodejs"
export async function GET(request: Request) {
  return cancelamentosHandler(request, "lista")
}

import { cancelamentosHandler } from "@/modules/cancelamentos/router"
export const runtime = "nodejs"
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return cancelamentosHandler(request, "pedido", (await context.params).id)
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return cancelamentosHandler(request, "pedido", (await context.params).id)
}

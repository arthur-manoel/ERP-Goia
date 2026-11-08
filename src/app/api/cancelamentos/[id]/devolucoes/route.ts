import { cancelamentosHandler } from "@/modules/cancelamentos/router"
export const runtime = "nodejs"
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return cancelamentosHandler(request, "devolucoes", (await context.params).id)
}

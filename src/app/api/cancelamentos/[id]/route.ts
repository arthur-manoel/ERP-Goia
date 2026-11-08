import { cancelamentosHandler } from "@/modules/cancelamentos/router"
export const runtime = "nodejs"
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return cancelamentosHandler(request, "detalhe", (await context.params).id)
}

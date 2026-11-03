import { cancelamentosHandler } from "@/modules/cancelamentos/router"
export const runtime = "nodejs"
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return cancelamentosHandler(request, "previa", (await context.params).id)
}

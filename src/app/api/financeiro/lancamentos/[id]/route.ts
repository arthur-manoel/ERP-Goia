import { detalheLancamentoHandler } from "@/modules/lancamentos-financeiros/router"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return detalheLancamentoHandler(request, (await params).id)
}

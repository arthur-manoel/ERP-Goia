import { listarOpcoesMovimentacao } from "@/lib/movimentacao/opcoes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return listarOpcoesMovimentacao(request)
}

import { readJson, readQuery } from "../../../lib/api/http"
import { contasPagarRequest } from "../../../../modules/contas_pagar/http"
import {
  createContaPagar,
  listContasPagar,
} from "../../../../modules/contas_pagar/service"

export const runtime = "nodejs"
export function GET(request: Request) {
  return contasPagarRequest(request, "pode_ler", (companies) =>
    listContasPagar(readQuery(request), companies),
  )
}
export function POST(request: Request) {
  return contasPagarRequest(
    request,
    "pode_criar",
    async (companies, actor) =>
      createContaPagar(await readJson(request), companies, actor),
    201,
  )
}

import { readJson, readQuery } from "../../../lib/api/http"
import { contasReceberRequest } from "../../../../modules/contas_receber/http"
import {
  createContaReceber,
  listContasReceber,
} from "../../../../modules/contas_receber/service"

export const runtime = "nodejs"

export function GET(request: Request) {
  return contasReceberRequest(request, "pode_ler", (companies) =>
    listContasReceber(readQuery(request), companies),
  )
}

export function POST(request: Request) {
  return contasReceberRequest(
    request,
    "pode_criar",
    async (companies, actor) =>
      createContaReceber(await readJson(request), companies, actor),
    201,
  )
}

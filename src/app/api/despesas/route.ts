import { readJson, readQuery } from "../../../lib/api/http"
import { despesasRequest } from "../../../../modules/despesas/http"
import {
  createDespesa,
  listDespesas,
} from "../../../../modules/despesas/service"
export const runtime = "nodejs"
export function GET(request: Request) {
  return despesasRequest(request, "pode_ler", (companies) =>
    listDespesas(readQuery(request), companies),
  )
}
export function POST(request: Request) {
  return despesasRequest(
    request,
    "pode_criar",
    async (companies, actor) =>
      createDespesa(await readJson(request), companies, actor),
    201,
  )
}

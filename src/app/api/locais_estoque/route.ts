import { readJson, readQuery } from "../../../lib/api/http"
import { locaisRequest } from "../../../../modules/locais_estoque/http"
import {
  createLocal,
  listLocais,
} from "../../../../modules/locais_estoque/service"

export const runtime = "nodejs"

export function GET(request: Request) {
  return locaisRequest(request, "pode_ler", (companies) =>
    listLocais(readQuery(request), companies),
  )
}

export function POST(request: Request) {
  return locaisRequest(
    request,
    "pode_criar",
    async (companies, actor) =>
      createLocal(await readJson(request), companies, actor),
    201,
  )
}

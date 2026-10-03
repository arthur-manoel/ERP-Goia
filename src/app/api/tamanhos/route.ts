import { readJson, readQuery } from "../../../lib/api/http"
import { catalogRequest } from "../../../../modules/catalogos/access"
import {
  createTamanho,
  listTamanhos,
} from "../../../../modules/tamanhos/service"
export const runtime = "nodejs"
export async function GET(request: Request) {
  return catalogRequest(request, "PRODUTOS", "pode_ler", (companies) =>
    listTamanhos(readQuery(request), companies),
  )
}
export async function POST(request: Request) {
  return catalogRequest(
    request,
    "PRODUTOS",
    "pode_criar",
    async (companies) => createTamanho(await readJson(request), companies),
    201,
  )
}

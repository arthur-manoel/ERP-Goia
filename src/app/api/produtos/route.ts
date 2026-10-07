import { readJson, readQuery } from "../../../lib/api/http"
import { catalogRequest } from "../../../../modules/catalogos/access"
import {
  createProduto,
  listProdutos,
} from "../../../../modules/produtos/service"
export const runtime = "nodejs"
export async function GET(request: Request) {
  return catalogRequest(request, "PRODUTOS", "pode_ler", (companies) =>
    listProdutos(readQuery(request), companies),
  )
}
export async function POST(request: Request) {
  return catalogRequest(
    request,
    "PRODUTOS",
    "pode_criar",
    async (companies) => createProduto(await readJson(request), companies),
    201,
  )
}

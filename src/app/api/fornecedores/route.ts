import { readJson, readQuery } from "../../../lib/api/http"
import { catalogRequest } from "../../../../modules/catalogos/access"
import {
  createFornecedor,
  listFornecedores,
} from "../../../../modules/fornecedores/service"
export const runtime = "nodejs"
export async function GET(request: Request) {
  return catalogRequest(request, null, "pode_ler", (companies) =>
    listFornecedores(readQuery(request), companies),
  )
}
export async function POST(request: Request) {
  return catalogRequest(
    request,
    null,
    "pode_criar",
    async (companies) => createFornecedor(await readJson(request), companies),
    201,
  )
}

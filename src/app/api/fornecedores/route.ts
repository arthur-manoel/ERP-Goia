import { handleRequest, readJson, readQuery } from "../../../lib/api/http"
import {
  createFornecedor,
  listFornecedores,
} from "../../../../modules/fornecedores/service"
export const runtime = "nodejs"
export async function GET(request: Request) {
  return handleRequest(() => listFornecedores(readQuery(request)))
}
export async function POST(request: Request) {
  return handleRequest(
    async () => createFornecedor(await readJson(request)),
    201,
  )
}

import { handleRequest, readJson } from "../../../../lib/api/http"
import {
  getFornecedor,
  updateFornecedor,
  deleteFornecedor,
} from "../../../../../modules/fornecedores/service"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
export async function GET(_request: Request, context: Context) {
  return handleRequest(async () => getFornecedor((await context.params).id))
}
export async function PUT(request: Request, context: Context) {
  return handleRequest(async () =>
    updateFornecedor((await context.params).id, await readJson(request)),
  )
}
export async function DELETE(_request: Request, context: Context) {
  return handleRequest(async () => deleteFornecedor((await context.params).id))
}

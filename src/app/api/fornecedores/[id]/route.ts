import { readJson } from "../../../../lib/api/http"
import { catalogRequest } from "../../../../../modules/catalogos/access"
import {
  getFornecedor,
  updateFornecedor,
  patchFornecedor,
  deleteFornecedor,
} from "../../../../../modules/fornecedores/service"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) {
  return catalogRequest(request, null, "pode_ler", async (companies) =>
    getFornecedor((await context.params).id, companies),
  )
}
export async function PUT(request: Request, context: Context) {
  return catalogRequest(request, null, "pode_editar", async (companies) =>
    updateFornecedor(
      (await context.params).id,
      await readJson(request),
      companies,
    ),
  )
}
export async function PATCH(request: Request, context: Context) {
  return catalogRequest(request, null, "pode_editar", async (companies) =>
    patchFornecedor(
      (await context.params).id,
      await readJson(request),
      companies,
    ),
  )
}
export async function DELETE(request: Request, context: Context) {
  return catalogRequest(request, null, "pode_excluir", async (companies) =>
    deleteFornecedor((await context.params).id, companies),
  )
}

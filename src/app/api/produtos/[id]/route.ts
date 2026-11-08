import { readJson } from "../../../../lib/api/http"
import { catalogRequest } from "../../../../../modules/catalogos/access"
import {
  getProduto,
  updateProduto,
  deleteProduto,
} from "../../../../../modules/produtos/service"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) {
  return catalogRequest(request, "PRODUTOS", "pode_ler", async (companies) =>
    getProduto((await context.params).id, companies),
  )
}
export async function PUT(request: Request, context: Context) {
  return catalogRequest(
    request,
    "PRODUTOS",
    "pode_editar",
    async (companies, actor) =>
      updateProduto(
        (await context.params).id,
        await readJson(request),
        actor.empresasAutorizadas ?? companies,
        companies,
        actor.idUsuario,
      ),
  )
}
export const PATCH = PUT
export async function DELETE(request: Request, context: Context) {
  return catalogRequest(
    request,
    "PRODUTOS",
    "pode_excluir",
    async (companies, actor) =>
      deleteProduto(
        (await context.params).id,
        actor.empresasAutorizadas ?? companies,
        companies,
        actor.idUsuario,
      ),
  )
}

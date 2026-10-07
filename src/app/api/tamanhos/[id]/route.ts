import { readJson } from "../../../../lib/api/http"
import { catalogRequest } from "../../../../../modules/catalogos/access"
import {
  getTamanho,
  updateTamanho,
  deleteTamanho,
} from "../../../../../modules/tamanhos/service"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) {
  return catalogRequest(request, "PRODUTOS", "pode_ler", async (companies) =>
    getTamanho((await context.params).id, companies),
  )
}
export async function PUT(request: Request, context: Context) {
  return catalogRequest(request, "PRODUTOS", "pode_editar", async (companies) =>
    updateTamanho(
      (await context.params).id,
      await readJson(request),
      companies,
    ),
  )
}
export const PATCH = PUT
export async function DELETE(request: Request, context: Context) {
  return catalogRequest(
    request,
    "PRODUTOS",
    "pode_excluir",
    async (companies) => deleteTamanho((await context.params).id, companies),
  )
}

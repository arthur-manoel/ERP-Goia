import { readJson, validate } from "../../../../lib/api/http"
import { categoriasRequest } from "../../../../../modules/categorias/http"
import { categoriaParamsSchema } from "../../../../../modules/categorias/schema"
import {
  getCategoria,
  updateCategoria,
  patchCategoria,
  deleteCategoria,
} from "../../../../../modules/categorias/service"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
async function idFrom(context: Context) {
  return String(validate(categoriaParamsSchema, await context.params).id)
}
export function GET(request: Request, context: Context) {
  return categoriasRequest(request, "pode_ler", async (companies) =>
    getCategoria(await idFrom(context), companies),
  )
}
export function PUT(request: Request, context: Context) {
  return categoriasRequest(request, "pode_editar", async (companies, actor) =>
    updateCategoria(
      await idFrom(context),
      await readJson(request),
      companies,
      actor,
    ),
  )
}
export function PATCH(request: Request, context: Context) {
  return categoriasRequest(request, "pode_editar", async (companies, actor) =>
    patchCategoria(
      await idFrom(context),
      await readJson(request),
      companies,
      actor,
    ),
  )
}
export function DELETE(request: Request, context: Context) {
  return categoriasRequest(request, "pode_excluir", async (companies, actor) =>
    deleteCategoria(await idFrom(context), companies, actor),
  )
}

import { readJson } from "../../../../lib/api/http"
import { catalogRequest } from "../../../../../modules/catalogos/access"
import {
  deleteCategoria,
  getCategoria,
  patchCategoria,
  updateCategoria,
} from "../../../../../modules/categorias/service"

export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
const readLimit = { scope: "categorias:read", limit: 120, windowMs: 60_000 }
const writeLimit = { scope: "categorias:write", limit: 30, windowMs: 60_000 }

export async function GET(request: Request, context: Context) {
  return catalogRequest(
    request,
    "CATEGORIAS",
    "pode_ler",
    async (companies) => getCategoria((await context.params).id, companies),
    200,
    readLimit,
  )
}

export async function PUT(request: Request, context: Context) {
  return catalogRequest(
    request,
    "CATEGORIAS",
    "pode_editar",
    async (companies) =>
      updateCategoria(
        (await context.params).id,
        await readJson(request),
        companies,
      ),
    200,
    writeLimit,
  )
}

export async function PATCH(request: Request, context: Context) {
  return catalogRequest(
    request,
    "CATEGORIAS",
    "pode_editar",
    async (companies) =>
      patchCategoria(
        (await context.params).id,
        await readJson(request),
        companies,
      ),
    200,
    writeLimit,
  )
}

export async function DELETE(request: Request, context: Context) {
  return catalogRequest(
    request,
    "CATEGORIAS",
    "pode_excluir",
    async (companies) => deleteCategoria((await context.params).id, companies),
    200,
    writeLimit,
  )
}

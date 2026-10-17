import { readJson } from "../../../../lib/api/http"
import { catalogRequest } from "../../../../../modules/catalogos/access"
import {
  deleteTipoProduto,
  getTipoProduto,
  patchTipoProduto,
  updateTipoProduto,
} from "../../../../../modules/tipos_produto/service"

export const runtime = "nodejs"

type Context = { params: Promise<{ id: string }> }
const readLimit = { scope: "tipos_produto:read", limit: 120, windowMs: 60_000 }
const writeLimit = { scope: "tipos_produto:write", limit: 30, windowMs: 60_000 }

export async function GET(request: Request, context: Context) {
  return catalogRequest(
    request,
    "PRODUTOS",
    "pode_ler",
    async () => getTipoProduto((await context.params).id),
    200,
    readLimit,
  )
}

export async function PUT(request: Request, context: Context) {
  return catalogRequest(
    request,
    "PRODUTOS",
    "pode_editar",
    async () =>
      updateTipoProduto((await context.params).id, await readJson(request)),
    200,
    writeLimit,
  )
}

export async function PATCH(request: Request, context: Context) {
  return catalogRequest(
    request,
    "PRODUTOS",
    "pode_editar",
    async () =>
      patchTipoProduto((await context.params).id, await readJson(request)),
    200,
    writeLimit,
  )
}

export async function DELETE(request: Request, context: Context) {
  return catalogRequest(
    request,
    "PRODUTOS",
    "pode_excluir",
    async () => deleteTipoProduto((await context.params).id),
    200,
    writeLimit,
  )
}

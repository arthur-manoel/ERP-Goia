import { readJson } from "../../../../lib/api/http"
import { catalogRequest } from "../../../../../modules/catalogos/access"
import {
  deleteDespesa,
  getDespesa,
  patchDespesa,
  updateDespesa,
} from "../../../../../modules/despesas/service"

export const runtime = "nodejs"

type Context = { params: Promise<{ id: string }> }
const readLimit = { scope: "despesas:read", limit: 120, windowMs: 60_000 }
const writeLimit = { scope: "despesas:write", limit: 30, windowMs: 60_000 }

export async function GET(request: Request, context: Context) {
  return catalogRequest(
    request,
    null,
    "pode_ler",
    async (companies) => getDespesa((await context.params).id, companies),
    200,
    readLimit,
  )
}

export async function PUT(request: Request, context: Context) {
  return catalogRequest(
    request,
    null,
    "pode_editar",
    async (companies) =>
      updateDespesa(
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
    null,
    "pode_editar",
    async (companies) =>
      patchDespesa(
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
    null,
    "pode_excluir",
    async (companies) => deleteDespesa((await context.params).id, companies),
    200,
    writeLimit,
  )
}

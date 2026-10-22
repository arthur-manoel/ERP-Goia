import { readJson } from "../../../../lib/api/http"
import { catalogRequest } from "../../../../../modules/catalogos/access"
import {
  deleteContaPagar,
  getContaPagar,
  patchContaPagar,
  updateContaPagar,
} from "../../../../../modules/contas_pagar/service"

export const runtime = "nodejs"

type Context = { params: Promise<{ id: string }> }
const readLimit = { scope: "contas_pagar:read", limit: 120, windowMs: 60_000 }
const writeLimit = { scope: "contas_pagar:write", limit: 30, windowMs: 60_000 }

export async function GET(request: Request, context: Context) {
  return catalogRequest(
    request,
    "FINANCEIRO",
    "pode_ler",
    async (companies) => getContaPagar((await context.params).id, companies),
    200,
    readLimit,
    ["ADMINISTRACAO", "FINANCEIRO"],
  )
}

export async function PUT(request: Request, context: Context) {
  return catalogRequest(
    request,
    "FINANCEIRO",
    "pode_editar",
    async (companies) =>
      updateContaPagar(
        (await context.params).id,
        await readJson(request),
        companies,
      ),
    200,
    writeLimit,
    ["ADMINISTRACAO", "FINANCEIRO"],
  )
}

export async function PATCH(request: Request, context: Context) {
  return catalogRequest(
    request,
    "FINANCEIRO",
    "pode_editar",
    async (companies) =>
      patchContaPagar(
        (await context.params).id,
        await readJson(request),
        companies,
      ),
    200,
    writeLimit,
    ["ADMINISTRACAO", "FINANCEIRO"],
  )
}

export async function DELETE(request: Request, context: Context) {
  return catalogRequest(
    request,
    "FINANCEIRO",
    "pode_excluir",
    async (companies) => deleteContaPagar((await context.params).id, companies),
    200,
    writeLimit,
    ["ADMINISTRACAO", "FINANCEIRO"],
  )
}

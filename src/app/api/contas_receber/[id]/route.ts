import { readJson } from "../../../../lib/api/http"
import { catalogRequest } from "../../../../../modules/catalogos/access"
import {
  deleteContaReceber,
  getContaReceber,
  patchContaReceber,
  updateContaReceber,
} from "../../../../../modules/contas_receber/service"

export const runtime = "nodejs"

type Context = { params: Promise<{ id: string }> }
const readLimit = {
  scope: "contas_receber:read",
  limit: 120,
  windowMs: 60_000,
}
const writeLimit = {
  scope: "contas_receber:write",
  limit: 30,
  windowMs: 60_000,
}

export async function GET(request: Request, context: Context) {
  return catalogRequest(
    request,
    "FINANCEIRO",
    "pode_ler",
    async (companies) => getContaReceber((await context.params).id, companies),
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
      updateContaReceber(
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
      patchContaReceber(
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
    async (companies) =>
      deleteContaReceber((await context.params).id, companies),
    200,
    writeLimit,
    ["ADMINISTRACAO", "FINANCEIRO"],
  )
}

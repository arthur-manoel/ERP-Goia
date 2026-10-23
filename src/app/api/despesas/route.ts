import { readJson, readQuery } from "../../../lib/api/http"
import { catalogRequest } from "../../../../modules/catalogos/access"
import {
  createDespesa,
  listDespesas,
} from "../../../../modules/despesas/service"

export const runtime = "nodejs"

const readLimit = { scope: "despesas:read", limit: 120, windowMs: 60_000 }
const writeLimit = { scope: "despesas:write", limit: 30, windowMs: 60_000 }

export async function GET(request: Request) {
  return catalogRequest(
    request,
    "FINANCEIRO",
    "pode_ler",
    (companies) => listDespesas(readQuery(request), companies),
    200,
    readLimit,
    ["ADMINISTRACAO", "FINANCEIRO"],
  )
}

export async function POST(request: Request) {
  return catalogRequest(
    request,
    "FINANCEIRO",
    "pode_criar",
    async (companies) => createDespesa(await readJson(request), companies),
    201,
    writeLimit,
    ["ADMINISTRACAO", "FINANCEIRO"],
  )
}

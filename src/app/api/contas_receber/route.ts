import { readJson, readQuery } from "../../../lib/api/http"
import { catalogRequest } from "../../../../modules/catalogos/access"
import {
  createContaReceber,
  listContasReceber,
} from "../../../../modules/contas_receber/service"

export const runtime = "nodejs"

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

export async function GET(request: Request) {
  return catalogRequest(
    request,
    "FINANCEIRO",
    "pode_ler",
    (companies) => listContasReceber(readQuery(request), companies),
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
    async (companies) => createContaReceber(await readJson(request), companies),
    201,
    writeLimit,
    ["ADMINISTRACAO", "FINANCEIRO"],
  )
}

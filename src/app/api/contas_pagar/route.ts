import { readJson, readQuery } from "../../../lib/api/http"
import { catalogRequest } from "../../../../modules/catalogos/access"
import {
  createContaPagar,
  listContasPagar,
} from "../../../../modules/contas_pagar/service"

export const runtime = "nodejs"

const readLimit = { scope: "contas_pagar:read", limit: 120, windowMs: 60_000 }
const writeLimit = { scope: "contas_pagar:write", limit: 30, windowMs: 60_000 }

export async function GET(request: Request) {
  return catalogRequest(
    request,
    null,
    "pode_ler",
    (companies) => listContasPagar(readQuery(request), companies),
    200,
    readLimit,
  )
}

export async function POST(request: Request) {
  return catalogRequest(
    request,
    null,
    "pode_criar",
    async (companies) => createContaPagar(await readJson(request), companies),
    201,
    writeLimit,
  )
}

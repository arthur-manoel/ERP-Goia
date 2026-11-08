import { readJson, readQuery } from "../../../lib/api/http"
import { catalogRequest } from "../../../../modules/catalogos/access"
import {
  createTipoProduto,
  listTiposProduto,
} from "../../../../modules/tipos_produto/service"

export const runtime = "nodejs"

const readLimit = { scope: "tipos_produto:read", limit: 120, windowMs: 60_000 }
const writeLimit = { scope: "tipos_produto:write", limit: 30, windowMs: 60_000 }

export async function GET(request: Request) {
  return catalogRequest(
    request,
    "TIPOS_PRODUTO",
    "pode_ler",
    () => listTiposProduto(readQuery(request)),
    200,
    readLimit,
  )
}

export async function POST(request: Request) {
  return catalogRequest(
    request,
    "TIPOS_PRODUTO",
    "pode_criar",
    async () => createTipoProduto(await readJson(request)),
    201,
    writeLimit,
  )
}

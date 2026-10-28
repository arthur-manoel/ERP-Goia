import { readJson, readQuery } from "../../../lib/api/http"
import { catalogRequest } from "../../../../modules/catalogos/access"
import {
  createCategoria,
  listCategorias,
} from "../../../../modules/categorias/service"

export const runtime = "nodejs"
const readLimit = { scope: "categorias:read", limit: 120, windowMs: 60_000 }
const writeLimit = { scope: "categorias:write", limit: 30, windowMs: 60_000 }

export async function GET(request: Request) {
  return catalogRequest(
    request,
    "CATEGORIAS",
    "pode_ler",
    (companies) => listCategorias(readQuery(request), companies),
    200,
    readLimit,
  )
}

export async function POST(request: Request) {
  return catalogRequest(
    request,
    "CATEGORIAS",
    "pode_criar",
    async (companies, actor) =>
      createCategoria(await readJson(request), companies, actor),
    201,
    writeLimit,
  )
}

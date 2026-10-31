import { readJson, readQuery } from "../../../lib/api/http"
import { categoriasRequest } from "../../../../modules/categorias/http"
import {
  createCategoria,
  listCategorias,
} from "../../../../modules/categorias/service"
export const runtime = "nodejs"
export function GET(request: Request) {
  return categoriasRequest(request, "pode_ler", (companies) =>
    listCategorias(readQuery(request), companies),
  )
}
export function POST(request: Request) {
  return categoriasRequest(
    request,
    "pode_criar",
    async (companies, actor) =>
      createCategoria(await readJson(request), companies, actor),
    201,
  )
}

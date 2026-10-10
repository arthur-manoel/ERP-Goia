import { readJson } from "../../../../lib/api/http"
import { catalogRequest } from "../../../../../modules/catalogos/access"
import {
  getCor,
  updateCor,
  deleteCor,
} from "../../../../../modules/cores/service"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
export async function GET(request: Request, context: Context) {
  return catalogRequest(request, "CORES", "pode_ler", async (companies) =>
    getCor((await context.params).id, companies),
  )
}
export async function PUT(request: Request, context: Context) {
  return catalogRequest(request, "CORES", "pode_editar", async (companies) =>
    updateCor((await context.params).id, await readJson(request), companies),
  )
}
export const PATCH = PUT
export async function DELETE(request: Request, context: Context) {
  return catalogRequest(request, "CORES", "pode_excluir", async (companies) =>
    deleteCor((await context.params).id, companies),
  )
}

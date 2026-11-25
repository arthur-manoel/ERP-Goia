import { readJson } from "../../../../lib/api/http"
import { locaisRequest } from "../../../../../modules/locais_estoque/http"
import {
  deleteLocal,
  getLocal,
  patchLocal,
} from "../../../../../modules/locais_estoque/service"

export const runtime = "nodejs"

type Context = { params: Promise<{ id: string }> }

export function GET(request: Request, context: Context) {
  return locaisRequest(request, "pode_ler", async (companies) =>
    getLocal((await context.params).id, companies),
  )
}

export function PATCH(request: Request, context: Context) {
  return locaisRequest(request, "pode_editar", async (companies, actor) =>
    patchLocal(
      (await context.params).id,
      await readJson(request),
      companies,
      actor,
    ),
  )
}

export function DELETE(request: Request, context: Context) {
  return locaisRequest(request, "pode_excluir", async (companies, actor) =>
    deleteLocal((await context.params).id, companies, actor),
  )
}

import { readJson, validate } from "../../../../lib/api/http"
import { despesasRequest } from "../../../../../modules/despesas/http"
import { despesaParamsSchema } from "../../../../../modules/despesas/schema"
import {
  getDespesa,
  updateDespesa,
  patchDespesa,
  deleteDespesa,
} from "../../../../../modules/despesas/service"
export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
async function idFrom(context: Context) {
  return String(validate(despesaParamsSchema, await context.params).id)
}
export function GET(request: Request, context: Context) {
  return despesasRequest(request, "pode_ler", async (companies) =>
    getDespesa(await idFrom(context), companies),
  )
}
export function PUT(request: Request, context: Context) {
  return despesasRequest(request, "pode_editar", async (companies, actor) =>
    updateDespesa(
      await idFrom(context),
      await readJson(request),
      companies,
      actor,
    ),
  )
}
export function PATCH(request: Request, context: Context) {
  return despesasRequest(request, "pode_editar", async (companies, actor) =>
    patchDespesa(
      await idFrom(context),
      await readJson(request),
      companies,
      actor,
    ),
  )
}
export function DELETE(request: Request, context: Context) {
  return despesasRequest(request, "pode_excluir", async (companies, actor) =>
    deleteDespesa(await idFrom(context), companies, actor),
  )
}

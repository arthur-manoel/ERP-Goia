import { readJson, validate } from "../../../../lib/api/http"
import { contasPagarRequest } from "../../../../../modules/contas_pagar/http"
import { contaPagarParamsSchema } from "../../../../../modules/contas_pagar/schema"
import {
  getContaPagar,
  updateContaPagar,
  patchContaPagar,
  deleteContaPagar,
} from "../../../../../modules/contas_pagar/service"

export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
async function idFrom(context: Context) {
  return String(validate(contaPagarParamsSchema, await context.params).id)
}
export function GET(request: Request, context: Context) {
  return contasPagarRequest(request, "pode_ler", async (companies) =>
    getContaPagar(await idFrom(context), companies),
  )
}
export function PUT(request: Request, context: Context) {
  return contasPagarRequest(request, "pode_editar", async (companies, actor) =>
    updateContaPagar(
      await idFrom(context),
      await readJson(request),
      companies,
      actor,
    ),
  )
}
export function PATCH(request: Request, context: Context) {
  return contasPagarRequest(request, "pode_editar", async (companies, actor) =>
    patchContaPagar(
      await idFrom(context),
      await readJson(request),
      companies,
      actor,
    ),
  )
}
export function DELETE(request: Request, context: Context) {
  return contasPagarRequest(request, "pode_excluir", async (companies, actor) =>
    deleteContaPagar(await idFrom(context), companies, actor),
  )
}

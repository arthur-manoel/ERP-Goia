import { readJson, validate } from "../../../../lib/api/http"
import { contasReceberRequest } from "../../../../../modules/contas_receber/http"
import { contaReceberParamsSchema } from "../../../../../modules/contas_receber/schema"
import {
  getContaReceber,
  updateContaReceber,
  patchContaReceber,
  deleteContaReceber,
} from "../../../../../modules/contas_receber/service"

export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }
async function idFrom(context: Context) {
  return String(validate(contaReceberParamsSchema, await context.params).id)
}

export function GET(request: Request, context: Context) {
  return contasReceberRequest(request, "pode_ler", async (companies) =>
    getContaReceber(await idFrom(context), companies),
  )
}

export function PUT(request: Request, context: Context) {
  return contasReceberRequest(
    request,
    "pode_editar",
    async (companies, actor) =>
      updateContaReceber(
        await idFrom(context),
        await readJson(request),
        companies,
        actor,
      ),
  )
}

export function PATCH(request: Request, context: Context) {
  return contasReceberRequest(
    request,
    "pode_editar",
    async (companies, actor) =>
      patchContaReceber(
        await idFrom(context),
        await readJson(request),
        companies,
        actor,
      ),
  )
}

export function DELETE(request: Request, context: Context) {
  return contasReceberRequest(
    request,
    "pode_excluir",
    async (companies, actor) =>
      deleteContaReceber(await idFrom(context), companies, actor),
  )
}

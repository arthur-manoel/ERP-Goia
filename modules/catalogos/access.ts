import { requireRole } from "../../src/lib/authorize"
import { HttpError } from "../../src/lib/api/errors"
import { handleRequest } from "../../src/lib/api/http"
import { allowedCompanies, type Resource, type Action } from "./repository"
export function assertCompany(id: number | undefined, companies: number[]) {
  if (id !== undefined && !companies.includes(id))
    throw new HttpError(403, "Sem permissão para esta empresa.")
}
export function catalogRequest<T>(
  request: Request,
  resource: Resource,
  action: Action,
  operation: (companies: number[]) => Promise<T>,
  status = 200,
) {
  return handleRequest(async () => {
    const auth = await requireRole(request, [
      "ADMINISTRACAO",
      "PRODUCAO",
      "VENDAS",
      "FINANCEIRO",
    ])
    if (auth.error)
      throw new HttpError(
        auth.error.status,
        auth.error.status === 401 ? "Não autenticado." : "Acesso negado.",
      )
    const id = Number(auth.user.id)
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new HttpError(401, "Não autenticado.")
    const companies = await allowedCompanies(id, resource, action)
    if (!companies.length)
      throw new HttpError(
        403,
        "Sem vínculo ativo ou permissão para esta operação.",
      )
    return operation(companies)
  }, status)
}

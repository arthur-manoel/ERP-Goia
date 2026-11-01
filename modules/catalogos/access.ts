import { requireRole, type Role } from "../../src/lib/authorize"
import { HttpError } from "../../src/lib/api/errors"
import { handleRequest, readJson } from "../../src/lib/api/http"
import { enforceRateLimit, type RateLimit } from "../../src/lib/api/rate-limit"
import { allowedCompanies, type Resource, type Action } from "./repository"
export type CatalogActor = { idUsuario: number }
export function assertCompany(id: number | undefined, companies: number[]) {
  if (id !== undefined && !companies.includes(id))
    throw new HttpError(403, "Sem permissão para esta empresa.")
}
export function catalogRequest<T>(
  request: Request,
  resource: Resource,
  action: Action,
  operation: (companies: number[], actor: CatalogActor) => Promise<T>,
  status = 200,
  rateLimit?: RateLimit,
  roles: Role[] = ["ADMINISTRACAO", "PRODUCAO", "VENDAS", "FINANCEIRO"],
) {
  return handleRequest(async () => {
    const auth = await requireRole(request, roles)
    if (auth.error)
      throw new HttpError(
        auth.error.status,
        auth.error.status === 401 ? "Não autenticado." : "Acesso negado.",
      )
    const id = Number(auth.user.id)
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647)
      throw new HttpError(401, "Não autenticado.")
    if (rateLimit) enforceRateLimit(request, rateLimit, String(id))
    let companies = await allowedCompanies(id, resource, action)
    if (!companies.length)
      throw new HttpError(
        403,
        "Sem vínculo ativo ou permissão para esta operação.",
      )
    const empresa = request.headers.get("X-Empresa-Id")
    if (empresa !== null) {
      if (!/^[1-9]\d*$/.test(empresa) || !companies.includes(Number(empresa)))
        throw new HttpError(403, "Sem permissão para esta empresa.")
      companies = [Number(empresa)]
    }
    // Inativar por POST/PUT/PATCH tem o mesmo efeito de DELETE nesses catálogos.
    if (
      ["pode_criar", "pode_editar"].includes(action) &&
      [
        "PRODUTOS",
        "CORES",
        "TAMANHOS",
        "TIPOS_PRODUTO",
        "FORNECEDORES",
      ].includes(resource)
    ) {
      const body = await readJson(request.clone())
      if (
        body &&
        typeof body === "object" &&
        "status" in body &&
        ["INATIVO", "INATIVA"].includes(String(body.status))
      ) {
        const exclusao = await allowedCompanies(id, resource, "pode_excluir")
        companies = companies.filter((company) => exclusao.includes(company))
        if (!companies.length)
          throw new HttpError(403, "Sem permissão para inativar nesta empresa.")
      }
    }
    return operation(companies, { idUsuario: id })
  }, status)
}

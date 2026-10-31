import { catalogRequest, assertCompany } from "../catalogos/access"
import type { Action } from "../catalogos/repository"
import type { FinancialActor } from "../financeiro/auditoria"
import { validate } from "../../src/lib/api/http"
import { despesaIdSchema } from "./schema"
const readLimit = { scope: "despesas:read", limit: 120, windowMs: 60_000 }
const writeLimit = { scope: "despesas:write", limit: 30, windowMs: 60_000 }
export function despesasRequest<T>(
  request: Request,
  action: Action,
  operation: (companies: number[], actor: FinancialActor) => Promise<T>,
  status = 200,
) {
  return catalogRequest(
    request,
    "FINANCEIRO",
    action,
    (companies, actor) => {
      const header = request.headers.get("X-Empresa-Id")
      if (header === null) return operation(companies, actor)
      const id = validate(despesaIdSchema, header)
      assertCompany(id, companies)
      return operation([id], actor)
    },
    status,
    action === "pode_ler" ? readLimit : writeLimit,
    ["ADMINISTRACAO", "FINANCEIRO"],
  )
}

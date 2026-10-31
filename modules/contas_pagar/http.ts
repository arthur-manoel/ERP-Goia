import { catalogRequest, assertCompany } from "../catalogos/access"
import type { Action } from "../catalogos/repository"
import { validate } from "../../src/lib/api/http"
import { contaPagarIdSchema } from "./schema"
import type { FinancialActor } from "../financeiro/auditoria"

const readLimit = { scope: "contas_pagar:read", limit: 120, windowMs: 60_000 }
const writeLimit = { scope: "contas_pagar:write", limit: 30, windowMs: 60_000 }
export function contasPagarRequest<T>(
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
      const idEmpresa = validate(contaPagarIdSchema, header)
      assertCompany(idEmpresa, companies)
      return operation([idEmpresa], actor)
    },
    status,
    action === "pode_ler" ? readLimit : writeLimit,
    ["ADMINISTRACAO", "FINANCEIRO"],
  )
}

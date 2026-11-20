import { catalogRequest, type CatalogActor } from "../catalogos/access"
import type { Action } from "../catalogos/repository"

const readLimit = { scope: "locais_estoque:read", limit: 120, windowMs: 60_000 }
const writeLimit = {
  scope: "locais_estoque:write",
  limit: 30,
  windowMs: 60_000,
}

/** Locais de estoque usam a permissão ESTOQUE e a empresa de X-Empresa-Id. */
export function locaisRequest<T>(
  request: Request,
  action: Action,
  operation: (companies: number[], actor: CatalogActor) => Promise<T>,
  status = 200,
) {
  return catalogRequest(
    request,
    "ESTOQUE",
    action,
    operation,
    status,
    action === "pode_ler" ? readLimit : writeLimit,
  )
}

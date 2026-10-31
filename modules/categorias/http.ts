import {
  catalogRequest,
  assertCompany,
  type CatalogActor,
} from "../catalogos/access"
import type { Action } from "../catalogos/repository"
import { validate } from "../../src/lib/api/http"
import { categoriaIdSchema } from "./schema"
const readLimit = { scope: "categorias:read", limit: 120, windowMs: 60_000 }
const writeLimit = { scope: "categorias:write", limit: 30, windowMs: 60_000 }
export function categoriasRequest<T>(
  request: Request,
  action: Action,
  operation: (companies: number[], actor: CatalogActor) => Promise<T>,
  status = 200,
) {
  return catalogRequest(
    request,
    "CATEGORIAS",
    action,
    (companies, actor) => {
      const header = request.headers.get("X-Empresa-Id")
      if (header === null) return operation(companies, actor)
      const id = validate(categoriaIdSchema, header)
      assertCompany(id, companies)
      return operation([id], actor)
    },
    status,
    action === "pode_ler" ? readLimit : writeLimit,
  )
}

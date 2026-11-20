import { cargosRequest, type Params } from "../../../../../modules/cargos/http"

export const runtime = "nodejs"

export const GET = (request: Request, context: Params) =>
  cargosRequest(request, "cargo", context)
export const PUT = (request: Request, context: Params) =>
  cargosRequest(request, "PUT", context)
export const PATCH = (request: Request, context: Params) =>
  cargosRequest(request, "PATCH", context)
export const DELETE = (request: Request, context: Params) =>
  cargosRequest(request, "inativar", context)

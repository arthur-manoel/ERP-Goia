import { empresasRequest } from "../../../../../modules/empresas/http"

export const runtime = "nodejs"
type Context = { params: Promise<{ id: string }> }

export const GET = (request: Request, context: Context) =>
  empresasRequest(request, "GET", context)
export const PUT = (request: Request, context: Context) =>
  empresasRequest(request, "PUT", context)
export const PATCH = (request: Request, context: Context) =>
  empresasRequest(request, "PATCH", context)
export const DELETE = (request: Request, context: Context) =>
  empresasRequest(request, "DELETE", context)

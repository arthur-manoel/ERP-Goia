import { empresasRequest } from "../../../../modules/empresas/http"

export const runtime = "nodejs"
export const GET = (request: Request) => empresasRequest(request, "GET")
export const POST = (request: Request) => empresasRequest(request, "POST")

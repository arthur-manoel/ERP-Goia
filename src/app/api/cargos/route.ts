import { cargosRequest } from "../../../../modules/cargos/http"

export const runtime = "nodejs"

export const GET = (request: Request) => cargosRequest(request, "listar")
export const POST = (request: Request) => cargosRequest(request, "criar")

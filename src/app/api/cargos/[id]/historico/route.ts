import {
  cargosRequest,
  type Params,
} from "../../../../../../modules/cargos/http"

export const runtime = "nodejs"

export const GET = (request: Request, context: Params) =>
  cargosRequest(request, "historico", context)

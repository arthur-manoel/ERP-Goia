import {
  cargosRequest,
  type Params,
} from "../../../../../../modules/cargos/http"

export const runtime = "nodejs"

export const POST = (request: Request, context: Params) =>
  cargosRequest(request, "ativar", context)

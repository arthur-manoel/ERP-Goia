import { catalogRequest } from "../../../../../modules/catalogos/access"
import { HttpError, ValidationError } from "../../../../../src/lib/api/errors"
import { readJson, readQuery, validate } from "../../../../../src/lib/api/http"
import { idSchema } from "../../../../../modules/fichas-tecnicas/schema"
import * as fichas from "../../../../../modules/fichas-tecnicas/service"

export const runtime = "nodejs"

const leitura = { scope: "fichas-tecnicas:read", limit: 120, windowMs: 60_000 }
const escrita = { scope: "fichas-tecnicas:write", limit: 30, windowMs: 60_000 }

function empresaAtiva(request: Request, companies: number[]) {
  const header = request.headers.get("X-Empresa-Id")
  if (header === null)
    throw new ValidationError("Informe X-Empresa-Id para selecionar a empresa.")
  if (!/^[1-9]\d*$/.test(header))
    throw new ValidationError("X-Empresa-Id deve ser um inteiro positivo.")
  const idEmpresa = validate(idSchema, Number(header))
  if (!companies.includes(idEmpresa))
    throw new HttpError(403, "Acesso negado à empresa selecionada.")
  return idEmpresa
}

export async function GET(request: Request) {
  return catalogRequest(
    request,
    "PRODUTOS",
    "pode_ler",
    (companies, actor) =>
      fichas.buscarAtiva(
        {
          idUsuario: actor.idUsuario,
          idEmpresa: empresaAtiva(request, companies),
        },
        readQuery(request),
      ),
    200,
    leitura,
  )
}

export async function PUT(request: Request) {
  return catalogRequest(
    request,
    "PRODUTOS",
    "pode_editar",
    async (companies, actor) =>
      fichas.salvarAtiva(
        {
          idUsuario: actor.idUsuario,
          idEmpresa: empresaAtiva(request, companies),
        },
        await readJson(request),
      ),
    200,
    escrita,
  )
}

import "server-only"
import { catalogRequest } from "../../../modules/catalogos/access"
import type { Action } from "../../../modules/catalogos/repository"
import { HttpError, ValidationError } from "@/lib/api/errors"
import { readJson, readQuery, validate } from "@/lib/api/http"
import { paramsSchema } from "./schema"
import type { Contexto } from "./repository"
import * as svc from "./service"
type RouteContext = { params: Promise<unknown> }
type Operation = (
  ctx: Contexto,
  request: Request,
  context?: RouteContext,
) => Promise<unknown>
function route(action: Action, operation: Operation, status = 200) {
  return (request: Request, context: RouteContext) =>
    catalogRequest(
      request,
      "FORNECEDORES",
      action,
      (companies, actor) => {
        const header = request.headers.get("X-Empresa-Id")
        if (header === null && companies.length !== 1)
          throw new ValidationError(
            "Selecione a empresa ativa em X-Empresa-Id.",
          )
        const idEmpresa =
          header === null
            ? companies[0]
            : validate(paramsSchema, { id: header }).id
        if (!companies.includes(idEmpresa))
          throw new HttpError(403, "Sem acesso à empresa selecionada.")
        return operation({ ...actor, idEmpresa }, request, context)
      },
      status,
      {
        scope:
          action === "pode_ler"
            ? "empresa-fornecedor:read"
            : "empresa-fornecedor:write",
        limit: action === "pode_ler" ? 120 : 30,
        windowMs: 60_000,
      },
    )
}
const list = route("pode_ler", (ctx, request) =>
  svc.findAll(ctx, readQuery(request)),
)
const suppliers = route("pode_ler", (ctx, request) =>
  svc.suppliers(ctx, readQuery(request)),
)
const create = route(
  "pode_criar",
  async (ctx, request) => svc.create(ctx, await readJson(request)),
  201,
)
export const getHandler = route("pode_ler", async (ctx, _request, context) =>
  svc.findById(ctx, await context!.params),
)
export const updateHandler = route(
  "pode_editar",
  async (ctx, request, context) =>
    svc.update(ctx, await context!.params, await readJson(request)),
)
export const patchHandler = route(
  "pode_editar",
  async (ctx, request, context) =>
    svc.patch(ctx, await context!.params, await readJson(request)),
)
export const deleteHandler = route(
  "pode_excluir",
  async (ctx, _request, context) => svc.inactivate(ctx, await context!.params),
)
const emptyContext = (): RouteContext => ({ params: Promise.resolve({}) })
export const listHandler = (request: Request) => list(request, emptyContext())
export const suppliersHandler = (request: Request) =>
  suppliers(request, emptyContext())
export const createHandler = (request: Request) =>
  create(request, emptyContext())

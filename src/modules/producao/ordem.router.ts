import "server-only"
import {
  errorResponse,
  handleRequest,
  readJson,
  readQuery,
  validate,
} from "@/lib/api/http"
import { autorizar } from "./producao.authorization"
import { ProducaoError } from "./producao.repository"
import * as schemas from "./ordem.schema"
import * as service from "./ordem.service"

export type RouteContext = { params: Promise<{ id: string }> }
export type ItemContext = { params: Promise<{ id: string; itemId: string }> }
export type StageContext = { params: Promise<{ id: string; etapaId: string }> }
type Operation =
  | "list"
  | "get"
  | "create"
  | "update"
  | "patch"
  | "cancel"
  | "items"
  | "stages"
  | "addItem"
  | "editItem"
  | "removeItem"
  | "production"
  | "startStage"
  | "finishStage"
  | service.Action
function respond<T>(operation: () => Promise<T>, status: number) {
  return handleRequest(async () => {
    try {
      return await operation()
    } catch (error) {
      // O fluxo legado usa 422 para configuração ausente; o novo contrato usa 400.
      if (error instanceof ProducaoError && error.status === 422)
        throw new ProducaoError(400, error.message)
      throw error
    }
  }, status)
}
async function execute(
  request: Request,
  operation: Operation,
  context?: RouteContext | ItemContext | StageContext,
) {
  try {
    const ctx = await autorizar(
      request,
      ["list", "get", "items", "stages"].includes(operation)
        ? "ler"
        : ["create", "addItem"].includes(operation)
          ? "criar"
          : ["cancel", "removeItem"].includes(operation)
            ? "excluir"
            : "editar",
    )
    if (ctx instanceof Response)
      return errorResponse(
        new ProducaoError(
          ctx.status,
          ctx.status === 401 ? "Não autenticado." : "Acesso negado.",
        ),
      )
    return respond(
      async () => {
        if (operation === "list") {
          const { page, limit, ...filters } = validate(
            schemas.listOrdemSchema,
            readQuery(request),
          )
          return service.findAll(ctx, filters, { page, limit })
        }
        if (operation === "create")
          return service.create(
            ctx,
            validate(schemas.createOrdemSchema, await readJson(request)),
          )
        const params = context ? await context.params : {}
        if (operation === "editItem" || operation === "removeItem") {
          const { id, itemId } = validate(schemas.itemParamsSchema, params)
          return service.editItem(
            ctx,
            id,
            itemId,
            operation === "removeItem"
              ? null
              : validate(schemas.patchItemSchema, await readJson(request)),
          )
        }
        if (operation === "production") {
          const { id, itemId } = validate(schemas.itemParamsSchema, params)
          return service.recordProduction(
            ctx,
            id,
            itemId,
            validate(schemas.apontarSchema, await readJson(request)),
          )
        }
        if (operation === "startStage" || operation === "finishStage") {
          const { id, etapaId } = validate(schemas.etapaParamsSchema, params)
          return service.stageAction(
            ctx,
            id,
            etapaId,
            operation === "startStage",
          )
        }
        const { id } = validate(schemas.ordemParamsSchema, params)
        if (operation === "get") return service.findById(ctx, id)
        if (operation === "cancel") return service.cancel(ctx, id)
        if (operation === "items")
          return service.listItems(
            ctx,
            id,
            validate(schemas.ordemPaginationSchema, readQuery(request)),
          )
        if (operation === "stages")
          return service.listStages(
            ctx,
            id,
            validate(schemas.ordemPaginationSchema, readQuery(request)),
          )
        if (operation === "addItem")
          return service.addItem(
            ctx,
            id,
            validate(schemas.ordemItemSchema, await readJson(request)),
          )
        if (operation === "update")
          return service.update(
            ctx,
            id,
            validate(schemas.updateOrdemSchema, await readJson(request)),
          )
        if (operation === "patch")
          return service.patch(
            ctx,
            id,
            validate(schemas.patchOrdemSchema, await readJson(request)),
          )
        return service.action(ctx, id, operation)
      },
      operation === "create" || operation === "addItem" ? 201 : 200,
    )
  } catch (error) {
    return errorResponse(error)
  }
}
export const listHandler = (request: Request) => execute(request, "list")
export const createHandler = (request: Request) => execute(request, "create")
export const getHandler = (request: Request, context: RouteContext) =>
  execute(request, "get", context)
export const updateHandler = (request: Request, context: RouteContext) =>
  execute(request, "update", context)
export const patchHandler = (request: Request, context: RouteContext) =>
  execute(request, "patch", context)
export const cancelHandler = (request: Request, context: RouteContext) =>
  execute(request, "cancel", context)
export const listItemsHandler = (request: Request, context: RouteContext) =>
  execute(request, "items", context)
export const listStagesHandler = (request: Request, context: RouteContext) =>
  execute(request, "stages", context)
export const addItemHandler = (request: Request, context: RouteContext) =>
  execute(request, "addItem", context)
export const productionHandler = (request: Request, context: ItemContext) =>
  execute(request, "production", context)
export const editItemHandler = (request: Request, context: ItemContext) =>
  execute(request, "editItem", context)
export const removeItemHandler = (request: Request, context: ItemContext) =>
  execute(request, "removeItem", context)
export const actionHandler =
  (action: service.Action) => (request: Request, context: RouteContext) =>
    execute(request, action, context)
export const startStageHandler = (request: Request, context: StageContext) =>
  execute(request, "startStage", context)
export const finishStageHandler = (request: Request, context: StageContext) =>
  execute(request, "finishStage", context)

import "server-only"
import type { z } from "zod"
import { autorizar } from "./clientes.authorization"
import { ClienteError } from "./clientes.repository"
import {
  criarSchema,
  editarSchema,
  idSchema,
  listarSchema,
  pedidosSchema,
} from "./clientes.schema"
import {
  buscarClientes,
  cadastrarCliente,
  consultarCliente,
  editarCliente,
  historicoPedidos,
  inativarCliente,
} from "./clientes.service"

type RouteContext = { params: Promise<{ id: string }> }
type Operacao =
  "criar" | "editar" | "listar" | "consultar" | "pedidos" | "excluir"
const headers = { "Cache-Control": "no-store" }
function validar<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success)
    throw new ClienteError(
      400,
      parsed.error.issues[0]?.message ?? "Dados inválidos.",
    )
  return parsed.data
}
function query(request: Request) {
  const params = new URL(request.url).searchParams
  const result: Record<string, string> = Object.create(null)
  for (const [key, value] of params) {
    if (Object.hasOwn(result, key))
      throw new ClienteError(400, "Não repita parâmetros de busca.")
    result[key] = value
  }
  return result
}
async function executar(
  request: Request,
  operacao: Operacao,
  context?: RouteContext,
) {
  try {
    const ctx = await autorizar(
      request,
      operacao === "criar" || operacao === "editar" || operacao === "excluir"
        ? operacao
        : "ler",
    )
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", "no-store")
      return ctx
    }
    let id = 0
    if (context) {
      const params = await context.params
      id = validar(
        idSchema,
        /^[1-9]\d*$/.test(params.id) ? Number(params.id) : NaN,
      )
    }
    let body: unknown
    if (operacao === "criar" || operacao === "editar") {
      try {
        body = await request.json()
      } catch {
        throw new ClienteError(400, "JSON inválido.")
      }
    }
    const result =
      operacao === "criar"
        ? await cadastrarCliente(ctx, validar(criarSchema, body))
        : operacao === "editar"
          ? await editarCliente(ctx, id, validar(editarSchema, body))
          : operacao === "excluir"
            ? await inativarCliente(ctx, id)
            : operacao === "listar"
              ? await buscarClientes(ctx, validar(listarSchema, query(request)))
              : operacao === "pedidos"
                ? await historicoPedidos(
                    ctx,
                    id,
                    validar(pedidosSchema, query(request)),
                  )
                : await consultarCliente(ctx, id)
    return Response.json(result, {
      status: operacao === "criar" ? 201 : 200,
      headers,
    })
  } catch (error) {
    if (error instanceof ClienteError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    // Detalhes e stack ficam exclusivamente no log interno do servidor.
    console.error("Falha na API de clientes", error)
    return Response.json({ error: "Erro interno" }, { status: 500, headers })
  }
}
export const criarHandler = (request: Request) => executar(request, "criar")
export const listarHandler = (request: Request) => executar(request, "listar")
export const consultarHandler = (request: Request, context: RouteContext) =>
  executar(request, "consultar", context)
export const editarHandler = (request: Request, context: RouteContext) =>
  executar(request, "editar", context)
export const excluirHandler = (request: Request, context: RouteContext) =>
  executar(request, "excluir", context)
export const pedidosHandler = (request: Request, context: RouteContext) =>
  executar(request, "pedidos", context)

import "server-only"
import { z } from "zod"
import { autorizar, type Acao } from "./pedidos.authorization"
import { PedidoError } from "./pedidos.error"
import {
  criarSchema,
  editarSchema,
  editarItemSchema,
  itemSchema,
  listarSchema,
  idRotaSchema,
  chaveSchema,
  versaoHeaderSchema,
} from "./pedidos.schema"
import * as service from "./pedidos.service"

type Context = { params: Promise<{ id: string; idItem?: string }> }
type Operacao =
  | "listar"
  | "consultar"
  | "criar"
  | "editar"
  | "incluir"
  | "editarItem"
  | "remover"
const headers = { "Cache-Control": "private, no-store" }
const acoes: Record<Operacao, Acao> = {
  listar: "ler",
  consultar: "ler",
  criar: "criar",
  editar: "editar",
  incluir: "editar",
  editarItem: "editar",
  remover: "excluir",
}
function validar<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success)
    throw new PedidoError(
      400,
      parsed.error.issues[0]?.message ?? "Dados inválidos.",
    )
  return parsed.data
}
function query(request: Request) {
  const result: Record<string, string> = Object.create(null)
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(result, key))
      throw new PedidoError(400, "Não repita parâmetros.")
    result[key] = value
  }
  return result
}
async function json(request: Request) {
  if (
    request.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() !== "application/json"
  )
    throw new PedidoError(400, "Envie JSON com Content-Type application/json.")
  const reader = request.body?.getReader()
  if (!reader) throw new PedidoError(400, "JSON inválido.")
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536) {
        await reader.cancel()
        throw new PedidoError(400, "JSON excede 64 KiB.")
      }
      chunks.push(value)
    }
    const data = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      data.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(data),
    ) as unknown
  } catch (error) {
    if (error instanceof PedidoError) throw error
    throw new PedidoError(400, "JSON inválido.")
  } finally {
    reader.releaseLock()
  }
}
async function executar(
  request: Request,
  operacao: Operacao,
  context?: Context,
) {
  try {
    const ctx = await autorizar(request, acoes[operacao])
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", headers["Cache-Control"])
      return ctx
    }
    const params = context ? await context.params : undefined
    const id = params ? validar(idRotaSchema, params.id) : 0
    const idItem =
      operacao === "editarItem" || operacao === "remover"
        ? validar(idRotaSchema, params?.idItem)
        : 0
    const filtros = query(request)
    if (operacao !== "listar") validar(z.strictObject({}), filtros)
    const versao = ["editar", "incluir", "editarItem", "remover"].includes(
      operacao,
    )
      ? validar(versaoHeaderSchema, request.headers.get("If-Match"))
      : 0
    const result =
      operacao === "listar"
        ? await service.listarPedidos(ctx, validar(listarSchema, filtros))
        : operacao === "consultar"
          ? await service.consultarPedido(ctx, id)
          : operacao === "criar"
            ? await service.criarPedido(
                ctx,
                validar(criarSchema, await json(request)),
                validar(chaveSchema, request.headers.get("Idempotency-Key")),
              )
            : operacao === "editar"
              ? await service.editarPedido(
                  ctx,
                  id,
                  versao,
                  validar(editarSchema, await json(request)),
                )
              : operacao === "incluir"
                ? await service.incluirItem(
                    ctx,
                    id,
                    versao,
                    validar(itemSchema, await json(request)),
                  )
                : operacao === "editarItem"
                  ? await service.editarItem(
                      ctx,
                      id,
                      idItem,
                      versao,
                      validar(editarItemSchema, await json(request)),
                    )
                  : await service.removerItem(ctx, id, idItem, versao)
    const status =
      operacao === "incluir" ||
      (operacao === "criar" && "criado" in result && result.criado)
        ? 201
        : 200
    return Response.json(result, {
      status,
      headers: {
        ...headers,
        ...("versao" in result ? { ETag: `"${result.versao}"` } : {}),
      },
    })
  } catch (error) {
    if (error instanceof PedidoError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    console.error("Falha interna na API de pedidos.")
    return Response.json({ error: "Erro interno." }, { status: 500, headers })
  }
}
export const listarHandler = (request: Request) => executar(request, "listar")
export const criarHandler = (request: Request) => executar(request, "criar")
export const consultarHandler = (request: Request, context: Context) =>
  executar(request, "consultar", context)
export const editarHandler = (request: Request, context: Context) =>
  executar(request, "editar", context)
export const incluirHandler = (request: Request, context: Context) =>
  executar(request, "incluir", context)
export const editarItemHandler = (request: Request, context: Context) =>
  executar(request, "editarItem", context)
export const removerHandler = (request: Request, context: Context) =>
  executar(request, "remover", context)

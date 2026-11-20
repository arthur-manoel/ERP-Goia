import "server-only"
import { z } from "zod"
import { autorizarVenda, type AcaoVenda } from "./vendas.authorization"
import { VendaError } from "./vendas.error"
import {
  criarVendaSchema,
  editarVendaSchema,
  idVendaSchema,
  listarVendasSchema,
} from "./vendas.schema"
import * as service from "./vendas.service"

const headers = { "Cache-Control": "private, no-store" }

function validar<T>(schema: z.ZodType<T>, entrada: unknown): T {
  const resultado = schema.safeParse(entrada)
  if (!resultado.success)
    throw new VendaError(
      400,
      resultado.error.issues[0]?.message ?? "Dados inválidos.",
    )
  return resultado.data
}

async function lerJson(request: Request) {
  if (
    request.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() !== "application/json"
  )
    throw new VendaError(400, "Envie JSON com Content-Type application/json.")
  const reader = request.body?.getReader()
  if (!reader) throw new VendaError(400, "JSON inválido.")
  const partes: Uint8Array[] = []
  let tamanho = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      tamanho += value.byteLength
      if (tamanho > 65536) {
        await reader.cancel()
        throw new VendaError(400, "JSON excede 64 KiB.")
      }
      partes.push(value)
    }
    const bytes = new Uint8Array(tamanho)
    let offset = 0
    for (const parte of partes) {
      bytes.set(parte, offset)
      offset += parte.byteLength
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown
  } catch (erro) {
    if (erro instanceof VendaError) throw erro
    throw new VendaError(400, "JSON inválido.")
  } finally {
    reader.releaseLock()
  }
}

async function executar(
  request: Request,
  acao: AcaoVenda,
  operacao: "listar" | "criar" | "consultar" | "editar" | "excluir",
  context?: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await autorizarVenda(request, acao)
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", headers["Cache-Control"])
      return ctx
    }
    let result: unknown
    if (operacao === "listar") {
      const searchParams = new URL(request.url).searchParams
      const filtros: Record<string, string> = Object.create(null)
      for (const [chave, valor] of searchParams) {
        if (Object.hasOwn(filtros, chave))
          throw new VendaError(400, "Não repita parâmetros.")
        filtros[chave] = valor
      }
      result = await service.listarVendas(
        ctx,
        validar(listarVendasSchema, filtros),
      )
    } else if (operacao === "criar") {
      result = await service.criarVenda(
        ctx,
        validar(criarVendaSchema, await lerJson(request)),
      )
    } else {
      const { id } = await context!.params
      const idVenda = validar(idVendaSchema, id)
      result =
        operacao === "consultar"
          ? await service.consultarVenda(ctx, idVenda)
          : operacao === "editar"
            ? await service.editarVenda(
                ctx,
                idVenda,
                validar(editarVendaSchema, await lerJson(request)),
              )
            : await service.excluirVenda(ctx, idVenda)
    }
    return Response.json(result, {
      status: operacao === "criar" ? 201 : 200,
      headers,
    })
  } catch (error) {
    if (error instanceof VendaError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    if (error instanceof z.ZodError)
      return Response.json(
        { error: error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400, headers },
      )
    console.error("Falha interna na API de vendas.")
    return Response.json({ error: "Erro interno." }, { status: 500, headers })
  }
}

export const listarHandler = (request: Request) =>
  executar(request, "ler", "listar")
export const criarHandler = (request: Request) =>
  executar(request, "criar", "criar")
export const consultarHandler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => executar(request, "ler", "consultar", context)
export const editarHandler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => executar(request, "editar", "editar", context)
export const excluirHandler = (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => executar(request, "excluir", "excluir", context)

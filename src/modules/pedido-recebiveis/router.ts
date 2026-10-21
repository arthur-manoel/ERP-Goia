import "server-only"
import { z } from "zod"
import { PedidoError } from "@/modules/pedidos/pedidos.error"
import {
  idRotaSchema,
  versaoHeaderSchema,
} from "@/modules/pedidos/pedidos.schema"
import {
  autorizarConsulta,
  autorizarFechamento,
} from "./recebiveis.authorization"
import { fecharSchema } from "./recebiveis.schema"
import * as service from "./recebiveis.service"

type Context = { params: Promise<{ id: string }> }
const headers = { "Cache-Control": "private, no-store" }

function validar<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success)
    throw new PedidoError(
      400,
      parsed.error.issues[0]?.message ?? "Dados inválidos.",
    )
  return parsed.data
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
  context: Context,
  operacao: "fechar" | "consultar",
) {
  try {
    const ctx = await (operacao === "fechar"
      ? autorizarFechamento(request)
      : autorizarConsulta(request))
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", headers["Cache-Control"])
      return ctx
    }
    const params = await context.params
    const id = validar(idRotaSchema, params.id)
    if (new URL(request.url).searchParams.size > 0)
      throw new PedidoError(
        400,
        "Esta operação não aceita parâmetros de consulta.",
      )
    if (operacao === "fechar") {
      const versao = validar(
        versaoHeaderSchema,
        request.headers.get("If-Match"),
      )
      const resultado = await service.fecharPedido(
        ctx,
        id,
        versao,
        validar(fecharSchema, await json(request)),
      )
      // O vendedor recebe apenas confirmação e referências, nunca o DTO financeiro.
      return Response.json(
        {
          idPedido: resultado.idPedido,
          idFechamento: resultado.idFechamento,
          idVenda: resultado.idVenda,
          versao: resultado.versao,
          fechadoEm: resultado.fechadoEm,
          gerado: resultado.gerado,
        },
        {
          status: resultado.gerado ? 201 : 200,
          headers: { ...headers, ETag: `"${resultado.versao}"` },
        },
      )
    }
    const resultado = await service.consultarContaReceber(ctx, id)
    return Response.json(resultado, { headers })
  } catch (error) {
    if (error instanceof PedidoError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    console.error("Falha interna na API de fechamento de pedidos.")
    return Response.json({ error: "Erro interno." }, { status: 500, headers })
  }
}

export const fecharHandler = (request: Request, context: Context) =>
  executar(request, context, "fechar")
export const consultarHandler = (request: Request, context: Context) =>
  executar(request, context, "consultar")

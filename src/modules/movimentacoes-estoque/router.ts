import "server-only"
import {
  ConflitoTransitorio,
  HttpError,
  ValidationError,
} from "@/lib/api/errors"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { readQuery, validate } from "@/lib/api/http"
import { confirmarMovimento } from "./confirmacao"
import { autorizar } from "./movimentacoes-estoque.authorization"
import { consultarSaldo, movimentar } from "./movimentacoes-estoque.repository"
import {
  ajusteSchema,
  movimentoSchema,
  saldoSchema,
} from "./movimentacoes-estoque.schema"

const headers = { "Cache-Control": "no-store" }

export async function lerJson(request: Request): Promise<unknown> {
  if (
    request.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase() !== "application/json"
  )
    throw new ValidationError("Envie JSON com Content-Type application/json.")
  const reader = request.body?.getReader()
  if (!reader) throw new ValidationError("JSON inválido.")
  try {
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536) {
        await reader.cancel()
        throw new ValidationError("JSON excede o limite de 64 KiB.")
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))
  } catch (error) {
    if (error instanceof ValidationError) throw error
    throw new ValidationError("JSON inválido.")
  } finally {
    reader.releaseLock()
  }
}

async function executar(
  request: Request,
  operacao: "entrada" | "saida" | "ajuste" | "saldo",
) {
  try {
    const ctx = await autorizar(
      request,
      operacao === "saldo" ? "ler" : operacao === "ajuste" ? "editar" : "criar",
    )
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", "no-store")
      return ctx
    }
    if (operacao === "saldo")
      return Response.json(
        await consultarSaldo(ctx, validate(saldoSchema, readQuery(request))),
        { headers },
      )
    if (new URL(request.url).search)
      throw new ValidationError("Esta operação não aceita parâmetros de busca.")
    const body = await lerJson(request)
    const dados =
      operacao === "ajuste"
        ? validate(ajusteSchema, body)
        : validate(movimentoSchema, body)
    const chave = request.headers.get("Idempotency-Key")
    if (chave !== null) {
      if (!/^[A-Za-z0-9._:-]{8,128}$/.test(chave))
        throw new ValidationError(
          "Idempotency-Key deve ter de 8 a 128 caracteres ASCII válidos.",
        )
      enforceRateLimit(
        request,
        { scope: "estoque:escrita-idempotente", limit: 60, windowMs: 60_000 },
        String(ctx.idUsuario),
      )
      const resultado = await confirmarMovimento(ctx, chave, dados, operacao)
      if (!resultado.dados.confirmada)
        return Response.json(
          { error: resultado.dados.mensagem, code: "ESTOQUE_RECUSADO" },
          { status: resultado.dados.status, headers },
        )
      return Response.json(resultado.dados.movimento, {
        status: resultado.criado ? 201 : 200,
        headers,
      })
    }
    return Response.json(await movimentar(ctx, dados, operacao), {
      status: 201,
      headers,
    })
  } catch (error) {
    if (!(error instanceof HttpError))
      console.error("Falha na API de movimentações de estoque.")
    return Response.json(
      {
        ...(error instanceof ConflitoTransitorio
          ? { code: "CONFLITO_TRANSITORIO" }
          : {}),
        error:
          error instanceof HttpError
            ? error.message
            : "Erro interno do servidor.",
      },
      { status: error instanceof HttpError ? error.status : 500, headers },
    )
  }
}
export const entradaHandler = (request: Request) => executar(request, "entrada")
export const saidaHandler = (request: Request) => executar(request, "saida")
export const ajusteHandler = (request: Request) => executar(request, "ajuste")
export const saldoHandler = (request: Request) => executar(request, "saldo")

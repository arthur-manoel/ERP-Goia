import "server-only"
import { z } from "zod"
import { autorizar } from "@/modules/producao/producao.authorization"
import { ProducaoError } from "@/modules/producao/producao.repository"
import {
  chaveSchema,
  idSchema,
  registrarSchema,
  corrigirSchema,
  estornarSchema,
} from "./apontamentos.schema"
import { gravar, consultar } from "./apontamentos.service"

type Context = { params: Promise<{ id: string; idApontamento?: string }> }
const consultaSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
function validar<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input)
  if (!parsed.success)
    throw new ProducaoError(
      400,
      parsed.error.issues[0]?.message ?? "Dados inválidos.",
    )
  return parsed.data
}
function id(value: string | undefined) {
  return validar(
    idSchema,
    value && /^[1-9]\d*$/.test(value) ? Number(value) : NaN,
  )
}
async function corpo(request: Request): Promise<unknown> {
  const reader = request.body?.getReader()
  if (!reader) throw new ProducaoError(400, "JSON inválido.")
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 65536) {
        await reader.cancel()
        throw new ProducaoError(413, "Corpo excede 64 KiB.")
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown
  } catch (error) {
    if (error instanceof ProducaoError) throw error
    throw new ProducaoError(400, "JSON inválido.")
  } finally {
    reader.releaseLock()
  }
}
export function handler(
  operacao: "consultar" | "registrar" | "corrigir" | "estornar",
) {
  return async (request: Request, context: Context) => {
    const headers = { "Cache-Control": "private, no-store" }
    try {
      const ctx = await autorizar(
        request,
        operacao === "consultar" ? "ler" : "editar",
      )
      if (ctx instanceof Response) {
        ctx.headers.set("Cache-Control", headers["Cache-Control"])
        return ctx
      }
      const params = await context.params
      const ordem = id(params.id)
      if (operacao === "consultar") {
        const search = new URL(request.url).searchParams
        for (const key of search.keys())
          if (search.getAll(key).length !== 1)
            throw new ProducaoError(400, "Parâmetro repetido.")
        const query = validar(consultaSchema, Object.fromEntries(search))
        return Response.json(
          await consultar(ctx, ordem, query.page, query.limit),
          { headers },
        )
      }
      const chave = validar(chaveSchema, request.headers.get("Idempotency-Key"))
      if (
        !/^application\/json(?:\s*;|$)/i.test(
          request.headers.get("Content-Type") ?? "",
        )
      )
        throw new ProducaoError(415, "Envie application/json.")
      const body = await corpo(request)
      const operation =
        operacao === "registrar"
          ? { tipo: "REGISTRO" as const, dados: validar(registrarSchema, body) }
          : operacao === "corrigir"
            ? {
                tipo: "CORRECAO" as const,
                dados: validar(corrigirSchema, body),
                alvo: id(params.idApontamento),
              }
            : {
                tipo: "ESTORNO" as const,
                dados: validar(estornarSchema, body),
                alvo: id(params.idApontamento),
              }
      const result = await gravar(ctx, ordem, chave, operation)
      return Response.json(result, {
        status: result.repetido ? 200 : 201,
        headers,
      })
    } catch (error) {
      if (error instanceof ProducaoError)
        return Response.json(
          { error: error.message },
          { status: error.status, headers },
        )
      console.error("Falha na API de apontamentos.")
      return Response.json(
        { error: "Não foi possível processar o apontamento." },
        { status: 500, headers },
      )
    }
  }
}

import { NextResponse } from "next/server"
import { z } from "zod"
import { HttpError, ValidationError } from "./errors"

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success)
    throw new ValidationError(
      result.error.issues
        .map(
          (issue) => `${issue.path.join(".") || "entrada"}: ${issue.message}`,
        )
        .join("; "),
    )
  return result.data
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new ValidationError("Corpo da requisição deve conter JSON válido.")
    throw error
  }
}

export async function readLimitedJson(request: Request): Promise<unknown> {
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
        void reader.cancel().catch(() => {})
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

export function readQuery(request: Request) {
  const query: Record<string, string> = Object.create(null)
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(query, key))
      throw new ValidationError(`Parâmetro repetido: ${key}.`)
    query[key] = value
  }
  return query
}

export function errorResponse(error: unknown) {
  if (!(error instanceof HttpError))
    console.error("[api] Erro inesperado:", error)
  return NextResponse.json(
    {
      success: false,
      error:
        error instanceof HttpError
          ? error.message
          : "Erro interno do servidor.",
    },
    {
      status: error instanceof HttpError ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  )
}

export async function handleRequest<T>(
  operation: () => Promise<T>,
  status = 200,
) {
  try {
    return NextResponse.json(
      { success: true, data: await operation() },
      {
        status,
        headers: { "Cache-Control": "no-store" },
      },
    )
  } catch (error) {
    return errorResponse(error)
  }
}

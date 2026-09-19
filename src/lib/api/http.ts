import { NextResponse } from "next/server";
import { z } from "zod";
import { ForbiddenError, HttpError, ValidationError } from "./errors";

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new ValidationError(result.error.issues.map(
    (issue) => `${issue.path.join(".") || "entrada"}: ${issue.message}`,
  ).join("; "));
  return result.data;
}

export async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch (error) {
    if (error instanceof SyntaxError) throw new ValidationError("Corpo da requisição deve conter JSON válido.");
    throw error;
  }
}

export function readQuery(request: Request) {
  const query: Record<string, string> = Object.create(null);
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(query, key)) throw new ValidationError(`Parâmetro repetido: ${key}.`);
    query[key] = value;
  }
  return query;
}

// Cookies são credenciais automáticas: toda escrita deve vir da mesma origem.
export function assertSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    throw new ForbiddenError("Origem da requisição não permitida.");
  }
}

export function errorResponse(error: unknown) {
  if (!(error instanceof HttpError)) console.error("[api] Erro inesperado:", error);
  return NextResponse.json({ success: false, error: error instanceof HttpError
    ? error.message : "Erro interno do servidor." }, {
    status: error instanceof HttpError ? error.status : 500,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function handleRequest<T>(operation: () => Promise<T>, status = 200) {
  try {
    return NextResponse.json({ success: true, data: await operation() }, {
      status, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return errorResponse(error); }
}

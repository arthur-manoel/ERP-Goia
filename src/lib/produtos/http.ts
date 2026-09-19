import { NextResponse } from "next/server";
import { ConflictError, NotFoundError, ValidationError } from "./service";
import { requireUser } from "../auth/http";
import { HttpError } from "../api/errors";

export type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw new ValidationError("Corpo da requisição deve conter JSON válido.");
    throw error;
  }
}

export async function handleRequest<T>(request: Request, operation: () => Promise<T>, status = 200) {
  try {
    await requireUser(request);
    const data = await operation();
    return NextResponse.json<ApiResponse<T>>({ success: true, data }, { status });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : error instanceof ValidationError ? 400
      : error instanceof NotFoundError ? 404
      : error instanceof ConflictError ? 409 : 500;
    if (status === 500) console.error("[produtos] Erro inesperado:", error);
    return NextResponse.json<ApiResponse<never>>({
      success: false,
      error: status === 500 ? "Erro interno do servidor." : (error as Error).message,
    }, { status });
  }
}

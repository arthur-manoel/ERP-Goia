import "server-only"
import type { z } from "zod"
import { autorizar } from "./producao.authorization"
import { ProducaoError } from "./producao.repository"
import {
  abrirSchema,
  alterarSchema,
  avancarSchema,
  encerrarSchema,
  idSchema,
} from "./producao.schema"
import {
  executarEtapa,
  consultarOrdem,
  abrirOrdem,
  alterarOrdem,
  avancarOrdem,
  encerrarOrdem,
} from "./producao.service"

import { etapaSchema } from "../fluxos/fluxos.schema"

type RouteContext = { params: Promise<{ id: string }> }
type Operacao =
  | "abrir"
  | "alterar"
  | "avancar"
  | "encerrar"
  | "iniciarEtapa"
  | "concluirEtapa"
  | "consultar"
async function executar(
  request: Request,
  operacao: Operacao,
  context?: RouteContext,
) {
  try {
    const ctx = await autorizar(
      request,
      operacao === "abrir"
        ? "criar"
        : operacao === "consultar"
          ? "ler"
          : "editar",
    )
    if (ctx instanceof Response) return ctx
    let id = 0
    if (context) {
      const params = await context.params
      const parsed = idSchema.safeParse(
        /^[1-9]\d*$/.test(params.id) ? Number(params.id) : NaN,
      )
      if (!parsed.success) throw new ProducaoError(400, "ID de ordem inválido.")
      id = parsed.data
    }
    let body: unknown
    try {
      body = operacao === "consultar" ? undefined : await request.json()
    } catch {
      throw new ProducaoError(400, "JSON inválido.")
    }
    function validar<T>(schema: z.ZodType<T>): T {
      const parsed = schema.safeParse(body)
      if (!parsed.success)
        throw new ProducaoError(
          400,
          parsed.error.issues[0]?.message ?? "Dados inválidos.",
        )
      return parsed.data
    }
    const result =
      operacao === "consultar"
        ? await consultarOrdem(ctx, id)
        : operacao === "iniciarEtapa" || operacao === "concluirEtapa"
          ? await executarEtapa(
              ctx,
              id,
              validar(etapaSchema).etapaId,
              operacao === "iniciarEtapa",
            )
          : operacao === "abrir"
            ? await abrirOrdem(ctx, validar(abrirSchema))
            : operacao === "alterar"
              ? await alterarOrdem(ctx, id, validar(alterarSchema))
              : operacao === "avancar"
                ? await avancarOrdem(ctx, id, validar(avancarSchema))
                : await encerrarOrdem(ctx, id, validar(encerrarSchema))
    return Response.json(result, {
      status: operacao === "abrir" ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (error instanceof ProducaoError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      )
    console.error("Falha na API de ordens de produção", error)
    return Response.json(
      { error: "Não foi possível processar a ordem de produção." },
      { status: 500 },
    )
  }
}
export const abrirHandler = (request: Request) => executar(request, "abrir")
export const alterarHandler = (request: Request, context: RouteContext) =>
  executar(request, "alterar", context)
export const avancarHandler = (request: Request, context: RouteContext) =>
  executar(request, "avancar", context)
export const encerrarHandler = (request: Request, context: RouteContext) =>
  executar(request, "encerrar", context)

export const iniciarEtapaHandler = (request: Request, context: RouteContext) =>
  executar(request, "iniciarEtapa", context)
export const concluirEtapaHandler = (request: Request, context: RouteContext) =>
  executar(request, "concluirEtapa", context)
export const consultarHandler = (request: Request, context: RouteContext) =>
  executar(request, "consultar", context)

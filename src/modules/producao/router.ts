import "server-only"
import { ConflitoTransitorio, HttpError } from "@/lib/api/errors"
import { executar as executarIdempotente } from "@/modules/reservas/operacoes"
import { chaveRecebimento } from "@/modules/recebimentos/recebimentos.schema"
import type { z } from "zod"
import { autorizar } from "./producao.authorization"
import {
  ProducaoError,
  transacao,
  type Contexto,
  type Transaction,
} from "./producao.repository"
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
  abrirOrdemNaTransacao,
  alterarOrdemNaTransacao,
  avancarOrdemNaTransacao,
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
async function confirmarEscrita<T>(
  request: Request,
  ctx: Contexto,
  tipo:
    | "ABERTURA_ORDEM_PRODUCAO"
    | "EDICAO_ORDEM_PRODUCAO"
    | "AVANCO_ORDEM_PRODUCAO",
  input: object,
  operacao: (tx: Transaction) => Promise<T>,
) {
  const abrir = tipo === "ABERTURA_ORDEM_PRODUCAO"
  const header = request.headers.get("Idempotency-Key")
  const headers = { "Cache-Control": "no-store" }
  if (header === null)
    return Response.json(await transacao(operacao), {
      status: abrir ? 201 : 200,
      headers,
    })

  const chave = chaveRecebimento.safeParse(header)
  if (!chave.success) throw new ProducaoError(400, "Idempotency-Key inválida.")
  const resultado = await executarIdempotente(
    ctx,
    chave.data,
    tipo,
    JSON.parse(JSON.stringify(input)),
    [["ORDENS_PRODUCAO", abrir ? "criar" : "editar"]],
    async (tx) => JSON.parse(JSON.stringify(await operacao(tx))),
  )
  return Response.json(resultado.dados, {
    status: abrir && resultado.criado ? 201 : 200,
    headers,
  })
}
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
    if (operacao === "abrir") {
      const input = validar(abrirSchema)
      return await confirmarEscrita(
        request,
        ctx,
        "ABERTURA_ORDEM_PRODUCAO",
        input,
        (tx) => abrirOrdemNaTransacao(tx, ctx, input),
      )
    }
    if (operacao === "alterar") {
      const input = validar(alterarSchema)
      return await confirmarEscrita(
        request,
        ctx,
        "EDICAO_ORDEM_PRODUCAO",
        { id, ...input },
        (tx) => alterarOrdemNaTransacao(tx, ctx, id, input),
      )
    }
    if (operacao === "avancar") {
      const input = validar(avancarSchema)
      return await confirmarEscrita(
        request,
        ctx,
        "AVANCO_ORDEM_PRODUCAO",
        { id, ...input },
        (tx) => avancarOrdemNaTransacao(tx, ctx, id, input),
      )
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
          : await encerrarOrdem(ctx, id, validar(encerrarSchema))
    return Response.json(result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json(
        {
          error: error.message,
          ...(error instanceof ConflitoTransitorio ? { code: error.code } : {}),
        },
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

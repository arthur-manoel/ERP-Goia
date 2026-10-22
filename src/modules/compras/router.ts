import "server-only"
import type { z } from "zod"
import { autorizar, type Area } from "./compras.authorization"
import { ComprasError, type Acao, type Contexto } from "./compras.repository"
import * as s from "./compras.schema"
import * as svc from "./compras.service"

// Aceita rotas sem parâmetros (listas) e com [id]; o Next valida esse tipo no build.
type RouteContext = { params: Promise<unknown> }
const headers = { "Cache-Control": "no-store" }

function validar<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data)
  if (!parsed.success)
    throw new ComprasError(
      400,
      parsed.error.issues[0]?.message ?? "Dados inválidos.",
    )
  return parsed.data
}
function query(request: Request) {
  const result: Record<string, string> = Object.create(null)
  for (const [key, value] of new URL(request.url).searchParams) {
    if (Object.hasOwn(result, key))
      throw new ComprasError(400, "Não repita parâmetros de busca.")
    result[key] = value
  }
  return result
}
async function corpo(request: Request) {
  try {
    return await request.json()
  } catch {
    throw new ComprasError(400, "JSON inválido.")
  }
}
async function idDaRota(context?: RouteContext) {
  const { id } = (await context!.params) as { id: string }
  return validar(s.idSchema, /^[1-9]\d*$/.test(id) ? Number(id) : NaN)
}

type Entrada = { ctx: Contexto; request: Request; context?: RouteContext }

function rota(
  area: Area,
  acao: Acao,
  executar: (entrada: Entrada) => Promise<unknown>,
  status = 200,
) {
  return async (request: Request, context?: RouteContext) => {
    try {
      const ctx = await autorizar(request, area, acao)
      if (ctx instanceof Response) {
        ctx.headers.set("Cache-Control", "no-store")
        return ctx
      }
      return Response.json(await executar({ ctx, request, context }), {
        status,
        headers,
      })
    } catch (error) {
      if (error instanceof ComprasError)
        return Response.json(
          { error: error.message },
          { status: error.status, headers },
        )
      // Detalhes ficam exclusivamente no log do servidor.
      console.error("Falha na API de compras", error)
      return Response.json({ error: "Erro interno" }, { status: 500, headers })
    }
  }
}

// Ações de status (enviar, aprovar, emitir, receber, cancelar) exigem permissão de edição.
export const opcoes = {
  listar: rota("opcoes", "ler", ({ ctx, request }) =>
    svc.listarOpcoes(ctx, validar(s.opcoesSchema, query(request))),
  ),
}

export const requisicoes = {
  listar: rota("requisicoes", "ler", ({ ctx, request }) =>
    svc.listarRequisicoes(
      ctx,
      validar(s.listarRequisicoesSchema, query(request)),
    ),
  ),
  criar: rota(
    "requisicoes",
    "criar",
    async ({ ctx, request }) =>
      svc.criarRequisicao(
        ctx,
        validar(s.criarRequisicaoSchema, await corpo(request)),
      ),
    201,
  ),
  consultar: rota("requisicoes", "ler", async ({ ctx, context }) =>
    svc.consultarRequisicao(ctx, await idDaRota(context)),
  ),
  editar: rota("requisicoes", "editar", async ({ ctx, request, context }) =>
    svc.editarRequisicao(
      ctx,
      await idDaRota(context),
      validar(s.editarRequisicaoSchema, await corpo(request)),
    ),
  ),
  acao: rota("requisicoes", "editar", async ({ ctx, request, context }) =>
    svc.acaoRequisicao(
      ctx,
      await idDaRota(context),
      validar(s.acaoRequisicaoSchema, await corpo(request)).acao,
    ),
  ),
}

export const pedidos = {
  listar: rota("pedidos", "ler", ({ ctx, request }) =>
    svc.listarPedidos(ctx, validar(s.listarPedidosSchema, query(request))),
  ),
  criar: rota(
    "pedidos",
    "criar",
    async ({ ctx, request }) =>
      svc.criarPedido(ctx, validar(s.criarPedidoSchema, await corpo(request))),
    201,
  ),
  consultar: rota("pedidos", "ler", async ({ ctx, context }) =>
    svc.consultarPedido(ctx, await idDaRota(context)),
  ),
  editar: rota("pedidos", "editar", async ({ ctx, request, context }) =>
    svc.editarPedido(
      ctx,
      await idDaRota(context),
      validar(s.editarPedidoSchema, await corpo(request)),
    ),
  ),
  acao: rota("pedidos", "editar", async ({ ctx, request, context }) =>
    svc.acaoPedido(
      ctx,
      await idDaRota(context),
      validar(s.acaoPedidoSchema, await corpo(request)).acao,
    ),
  ),
}

export const compras = {
  listar: rota("compras", "ler", ({ ctx, request }) =>
    svc.listarCompras(ctx, validar(s.listarComprasSchema, query(request))),
  ),
  criar: rota(
    "compras",
    "criar",
    async ({ ctx, request }) =>
      svc.criarCompra(ctx, validar(s.criarCompraSchema, await corpo(request))),
    201,
  ),
  consultar: rota("compras", "ler", async ({ ctx, context }) =>
    svc.consultarCompra(ctx, await idDaRota(context)),
  ),
  receber: rota("compras", "editar", async ({ ctx, request, context }) =>
    svc.receberCompra(
      ctx,
      await idDaRota(context),
      validar(s.receberCompraSchema, await corpo(request)),
    ),
  ),
  acao: rota("compras", "editar", async ({ ctx, request, context }) =>
    svc.acaoCompra(
      ctx,
      await idDaRota(context),
      validar(s.acaoCompraSchema, await corpo(request)).acao,
    ),
  ),
}

export const notas = {
  listar: rota("notas", "ler", ({ ctx, request }) =>
    svc.listarNotas(ctx, validar(s.listarNotasSchema, query(request))),
  ),
  criar: rota(
    "notas",
    "criar",
    async ({ ctx, request }) =>
      svc.criarNota(ctx, validar(s.criarNotaSchema, await corpo(request))),
    201,
  ),
  consultar: rota("notas", "ler", async ({ ctx, context }) =>
    svc.consultarNota(ctx, await idDaRota(context)),
  ),
  editar: rota("notas", "editar", async ({ ctx, request, context }) =>
    svc.editarNota(
      ctx,
      await idDaRota(context),
      validar(s.editarNotaSchema, await corpo(request)),
    ),
  ),
  acao: rota("notas", "editar", async ({ ctx, request, context }) => {
    const input = validar(s.acaoNotaSchema, await corpo(request))
    return svc.acaoNota(
      ctx,
      await idDaRota(context),
      input.acao,
      input.dataRecebimento,
    )
  }),
}

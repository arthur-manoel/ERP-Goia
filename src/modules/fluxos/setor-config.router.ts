import "server-only"
import type { z } from "zod"
import { autorizar } from "../producao/producao.authorization"
import { ProducaoError } from "../producao/producao.repository"
import { HttpError } from "@/lib/api/errors"
import * as schemas from "./fluxos.schema"
import * as service from "./fluxos.service"

type RouteContext = { params: Promise<{ id: string }> }
const headers = { "Cache-Control": "no-store" }

function validar<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.safeParse(value)
  if (!parsed.success)
    throw new ProducaoError(
      400,
      parsed.error.issues[0]?.message ?? "Dados inválidos.",
    )
  return parsed.data
}
async function corpo(request: Request) {
  try {
    return (await request.json()) as unknown
  } catch {
    throw new ProducaoError(400, "JSON inválido.")
  }
}
async function idDaRota(context: RouteContext) {
  const param = (await context.params).id
  return validar(
    schemas.idSchema,
    /^[1-9]\d*$/.test(param) ? Number(param) : NaN,
  )
}
async function executar(
  request: Request,
  acao: "ler" | "criar" | "editar",
  operacao: (
    ctx: Exclude<Awaited<ReturnType<typeof autorizar>>, Response>,
  ) => Promise<unknown>,
  status = 200,
) {
  try {
    // Mesma autorização do cadastro de setores: recurso SETORES por empresa.
    const ctx = await autorizar(request, acao, "SETORES")
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", "no-store")
      return ctx
    }
    return Response.json(await operacao(ctx), { status, headers })
  } catch (error) {
    if (error instanceof ProducaoError || error instanceof HttpError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    console.error("Falha na API de tipos e permissões de setor", error)
    return Response.json({ error: "Erro interno" }, { status: 500, headers })
  }
}

export const tiposSetor = {
  listar: (request: Request) =>
    executar(request, "ler", (ctx) => {
      const query: Record<string, string> = Object.create(null)
      for (const [key, value] of new URL(request.url).searchParams) {
        if (Object.hasOwn(query, key))
          throw new ProducaoError(400, "Não repita parâmetros de busca.")
        query[key] = value
      }
      return service.listarTipos(
        ctx,
        validar(schemas.listarTiposSchema, query).status,
      )
    }),
  criar: (request: Request) =>
    executar(
      request,
      "criar",
      async (ctx) =>
        service.criarTipo(
          ctx,
          validar(schemas.tipoSetorSchema, await corpo(request)).nome,
        ),
      201,
    ),
  alterar: (request: Request, context: RouteContext) =>
    executar(request, "editar", async (ctx) =>
      service.alterarStatusTipo(
        ctx,
        await idDaRota(context),
        validar(schemas.alterarTipoSetorSchema, await corpo(request)).ativo,
      ),
    ),
}

export const recursosSetor = {
  substituir: (request: Request, context: RouteContext) =>
    executar(request, "editar", async (ctx) =>
      service.substituirRecursosSetor(
        ctx,
        await idDaRota(context),
        validar(schemas.recursosSetorSchema, await corpo(request)).recursos,
      ),
    ),
}

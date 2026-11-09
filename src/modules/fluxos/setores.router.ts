import "server-only"
import { autorizar } from "../producao/producao.authorization"
import { ProducaoError, type Contexto } from "../producao/producao.repository"
import * as schemas from "./fluxos.schema"
import * as service from "./fluxos.service"

type RouteContext = { params: Promise<{ id: string }> }
const headers = { "Cache-Control": "no-store" }

async function executar(
  request: Request,
  acao: "ler" | "editar",
  operacao: (ctx: Contexto) => Promise<unknown>,
) {
  try {
    const ctx = await autorizar(request, acao)
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", "no-store")
      return ctx
    }
    return Response.json(await operacao(ctx), { status: 200, headers })
  } catch (error) {
    if (error instanceof ProducaoError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    console.error("Falha na API de tipos e permissões de setor", error)
    return Response.json({ error: "Erro interno" }, { status: 500, headers })
  }
}
function idDe(param: string) {
  const parsed = schemas.idSchema.safeParse(
    /^[1-9]\d*$/.test(param) ? Number(param) : NaN,
  )
  if (!parsed.success) throw new ProducaoError(400, "Identificador inválido.")
  return parsed.data
}

/** GET /api/tipos_setor — tipos ativos da empresa (tabela tipos_setor). */
export const listarTiposSetor = (request: Request) =>
  executar(request, "ler", (ctx) => service.listarTipos(ctx))

/** GET /api/setores/[id]/permissoes — recursos registrados em permissoes_setor. */
export const consultarPermissoesSetor = (
  request: Request,
  context: RouteContext,
) =>
  executar(request, "ler", async (ctx) =>
    service.consultarRecursos(ctx, idDe((await context.params).id)),
  )

/** PUT /api/setores/[id]/permissoes — substitui os recursos do setor. */
export const substituirPermissoesSetor = (
  request: Request,
  context: RouteContext,
) =>
  executar(request, "editar", async (ctx) => {
    const id = idDe((await context.params).id)
    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ProducaoError(400, "JSON inválido.")
    }
    const parsed = schemas.recursosSetorSchema.safeParse(body)
    if (!parsed.success)
      throw new ProducaoError(
        400,
        parsed.error.issues[0]?.message ?? "Dados inválidos.",
      )
    return service.substituirRecursos(ctx, id, parsed.data.recursos)
  })

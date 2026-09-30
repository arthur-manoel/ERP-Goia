import "server-only"
import type { z } from "zod"
import { autorizar } from "../producao/producao.authorization"
import { ProducaoError } from "../producao/producao.repository"
import * as schemas from "./fluxos.schema"
import * as service from "./fluxos.service"
import type { Entidade } from "./fluxos.repository"

type RouteContext = { params: Promise<{ id: string }> }
type Operacao =
  | "criar"
  | "editar"
  | "consultar"
  | "listar"
  | "excluir"
  | "associar"
  | "desassociar"
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
export function handler(tipo: Entidade, operacao: Operacao) {
  return async (request: Request, context?: RouteContext) => {
    try {
      const associacao = operacao === "associar" || operacao === "desassociar"
      const acao =
        operacao === "criar"
          ? "criar"
          : operacao === "excluir"
            ? "excluir"
            : operacao === "listar" || operacao === "consultar"
              ? "ler"
              : "editar"
      const ctx = await autorizar(
        request,
        acao,
        associacao ? "PRODUTOS" : "ORDENS_PRODUCAO",
      )
      if (ctx instanceof Response) {
        ctx.headers.set("Cache-Control", "no-store")
        return ctx
      }
      const param = context ? (await context.params).id : undefined
      const id =
        param === undefined
          ? 0
          : validar(
              schemas.idSchema,
              /^[1-9]\d*$/.test(param) ? Number(param) : NaN,
            )
      let body: unknown
      if (["criar", "editar", "associar"].includes(operacao)) {
        try {
          body = await request.json()
        } catch {
          throw new ProducaoError(400, "JSON inválido.")
        }
      }
      if (operacao === "excluir" || operacao === "desassociar") {
        if (associacao) await service.associar(ctx, id, null)
        else await service.excluir(ctx, tipo, id)
        return new Response(null, { status: 204, headers })
      }
      let result: unknown
      if (operacao === "associar")
        result = await service.associar(
          ctx,
          id,
          validar(schemas.associarSchema, body).fluxoId,
        )
      else if (operacao === "consultar")
        result = await service.consultar(ctx, tipo, id)
      else if (operacao === "listar") {
        const query: Record<string, string> = Object.create(null)
        for (const [key, value] of new URL(request.url).searchParams) {
          if (Object.hasOwn(query, key))
            throw new ProducaoError(400, "Não repita parâmetros de busca.")
          query[key] = value
        }
        result = await service.listar(
          ctx,
          tipo,
          validar(schemas.listarSchema, query),
        )
      } else {
        const input =
          tipo === "setor"
            ? validar(
                operacao === "criar"
                  ? schemas.setorSchema
                  : schemas.editarSetorSchema,
                body,
              )
            : validar(
                operacao === "criar"
                  ? schemas.fluxoSchema
                  : schemas.editarFluxoSchema,
                body,
              )
        // Inativação também exige permissão de exclusão, como no módulo de clientes.
        if (input.ativo === false) {
          const autorizado = await autorizar(request, "excluir")
          if (autorizado instanceof Response) return autorizado
        }
        result = await service.salvar(
          ctx,
          tipo,
          input,
          operacao === "editar" ? id : undefined,
        )
      }
      return Response.json(result, {
        status: operacao === "criar" ? 201 : 200,
        headers,
      })
    } catch (error) {
      if (error instanceof ProducaoError)
        return Response.json(
          { error: error.message },
          { status: error.status, headers },
        )
      console.error("Falha na API de setores e fluxos", error)
      return Response.json({ error: "Erro interno" }, { status: 500, headers })
    }
  }
}

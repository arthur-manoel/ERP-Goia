import "server-only"
import { isIP } from "node:net"
import { requireRole } from "@/lib/authorize"
import { handleRequest, readJson, readQuery, validate } from "@/lib/api/http"
import { HttpError } from "@/lib/api/errors"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { cargoIdSchema, cargoParamsSchema } from "./schema"
import * as service from "./service"

export type Params = { params: Promise<{ id: string }> }
type Operacao =
  | "listar"
  | "criar"
  | "cargo"
  | "usuarios"
  | "historico"
  | "PUT"
  | "PATCH"
  | "ativar"
  | "inativar"
export async function cargosRequest(
  request: Request,
  op: Operacao,
  context?: Params,
) {
  let etag: string | undefined
  const response = await handleRequest<unknown>(
    async () => {
      const auth = await requireRole(request, [
        "ADMINISTRACAO",
        "PRODUCAO",
        "VENDAS",
        "FINANCEIRO",
      ])
      if (auth.error)
        throw new HttpError(
          auth.error.status,
          auth.error.status === 401 ? "Não autenticado." : "Acesso negado.",
        )
      const idUsuario = validate(cargoIdSchema, String(auth.user.id))
      const isRead = request.method === "GET"
      const scope = isRead ? "cargos:leitura" : "cargos:escrita"
      enforceRateLimit(
        request,
        { scope, limit: isRead ? 120 : 30, windowMs: 60_000 },
        String(idUsuario),
      )
      const endereco =
        process.env.CARGOS_TRUST_PROXY === "true"
          ? request.headers.get("x-real-ip")
          : null
      const ip = endereco && isIP(endereco) ? endereco : undefined
      if (ip)
        enforceRateLimit(
          request,
          { scope: scope + ":ip", limit: isRead ? 300 : 90, windowMs: 60_000 },
          ip,
        )
      const ctx = {
        idUsuario,
        idEmpresa: validate(cargoIdSchema, request.headers.get("X-Empresa-Id")),
        ip,
        agente: request.headers.get("user-agent")?.slice(0, 512),
        requisicao: request.headers.get("x-request-id")?.slice(0, 128),
      }
      if (op === "listar") return service.listar(ctx, readQuery(request))
      if (op === "criar") {
        const result = await service.criar(ctx, await readJson(request))
        etag = result.etag
        return result.data
      }
      const { id } = validate(cargoParamsSchema, {
        id: (await context?.params)?.id,
      })
      if (op === "cargo" || op === "usuarios" || op === "historico") {
        const result = await service.consultar(ctx, id, op, readQuery(request))
        etag = result.etag
        return result.data
      }
      const input =
        op === "PUT" || op === "PATCH" ? await readJson(request) : undefined
      const result = await service.alterar(
        ctx,
        id,
        op,
        request.headers.get("If-Match"),
        input,
      )
      etag = result.etag
      return result.data
    },
    op === "criar" ? 201 : 200,
  )
  if (etag) response.headers.set("ETag", etag)
  return response
}

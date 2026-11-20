import "server-only"
import { isIP } from "node:net"
import { requireRole } from "@/lib/authorize"
import { HttpError, ValidationError } from "@/lib/api/errors"
import { handleRequest, readQuery, validate } from "@/lib/api/http"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { empresaIdSchema, empresaParamsSchema } from "./schema"
import * as service from "./service"

const maxBytes = 16_384
async function lerCorpo(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new ValidationError("Corpo da requisição excede 16 KiB.")
  const reader = request.body?.getReader()
  if (!reader) throw new ValidationError("Informe um corpo JSON.")
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let bytes = 0
  let corpo = ""
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw new ValidationError("Corpo da requisição excede 16 KiB.")
      }
      corpo += decoder.decode(value, { stream: true })
    }
    return JSON.parse(corpo + decoder.decode())
  } catch (error) {
    if (error instanceof HttpError) throw error
    throw new ValidationError("Corpo da requisição deve conter JSON válido.")
  } finally {
    reader.releaseLock()
  }
}

type Params = { params: Promise<{ id: string }> }
type Metodo = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
export function empresasRequest(
  request: Request,
  metodo: Metodo,
  context?: Params,
) {
  return handleRequest<unknown>(
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
      const idUsuario = Number(auth.user.id)
      if (
        !Number.isInteger(idUsuario) ||
        idUsuario <= 0 ||
        idUsuario > 2_147_483_647
      )
        throw new HttpError(401, "Não autenticado.")
      const header = request.headers.get("X-Empresa-Id")
      const selecionada =
        header === null ? undefined : validate(empresaIdSchema, header)
      const endereco =
        process.env.EMPRESAS_TRUST_PROXY === "true"
          ? request.headers.get("x-real-ip")
          : null
      const ip = endereco && isIP(endereco) ? endereco : undefined
      const leitura = metodo === "GET"
      const scope = leitura ? "empresas:ler" : "empresas:escrever"
      enforceRateLimit(
        request,
        { scope, limit: leitura ? 120 : 30, windowMs: 60_000 },
        String(idUsuario),
      )
      if (ip)
        enforceRateLimit(
          request,
          { scope: scope + ":ip", limit: leitura ? 300 : 90, windowMs: 60_000 },
          ip,
        )
      const ator = {
        idUsuario,
        ip,
        agente: request.headers.get("user-agent")?.slice(0, 512),
      }

      if (metodo === "POST") {
        if (selecionada !== undefined)
          await service.consultarEmpresa(ator, selecionada)
        return service.criarEmpresa(ator, await lerCorpo(request))
      }
      if (!context)
        return service.listarEmpresas(ator, readQuery(request), selecionada)
      const params = await context.params
      const { id } = validate(empresaParamsSchema, { id: params.id })
      if (selecionada !== undefined && selecionada !== id)
        throw new HttpError(404, "Empresa não encontrada.")
      if (metodo === "GET") return service.consultarEmpresa(ator, id)
      return service.alterarEmpresa(
        ator,
        id,
        metodo,
        metodo === "DELETE" ? undefined : await lerCorpo(request),
      )
    },
    metodo === "POST" ? 201 : 200,
  )
}

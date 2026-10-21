import "server-only"
import { HttpError, ValidationError } from "@/lib/api/errors"
import { readQuery, validate } from "@/lib/api/http"
import { autorizar } from "./movimentacoes-estoque.authorization"
import { consultarSaldo, movimentar } from "./movimentacoes-estoque.repository"
import {
  ajusteSchema,
  movimentoSchema,
  saldoSchema,
} from "./movimentacoes-estoque.schema"

const headers = { "Cache-Control": "no-store" }
async function executar(
  request: Request,
  operacao: "entrada" | "saida" | "ajuste" | "saldo",
) {
  try {
    const ctx = await autorizar(
      request,
      operacao === "saldo" ? "ler" : operacao === "ajuste" ? "editar" : "criar",
    )
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", "no-store")
      return ctx
    }
    if (operacao === "saldo")
      return Response.json(
        await consultarSaldo(ctx, validate(saldoSchema, readQuery(request))),
        { headers },
      )
    if (new URL(request.url).search)
      throw new ValidationError("Esta operação não aceita parâmetros de busca.")
    let body: unknown
    try {
      body = await request.json()
    } catch {
      throw new ValidationError("JSON inválido.")
    }
    const dados =
      operacao === "ajuste"
        ? validate(ajusteSchema, body)
        : validate(movimentoSchema, body)
    return Response.json(await movimentar(ctx, dados, operacao), {
      status: 201,
      headers,
    })
  } catch (error) {
    if (!(error instanceof HttpError))
      console.error("Falha na API de movimentações de estoque", error)
    return Response.json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "Erro interno do servidor.",
      },
      { status: error instanceof HttpError ? error.status : 500, headers },
    )
  }
}
export const entradaHandler = (request: Request) => executar(request, "entrada")
export const saidaHandler = (request: Request) => executar(request, "saida")
export const ajusteHandler = (request: Request) => executar(request, "ajuste")
export const saldoHandler = (request: Request) => executar(request, "saldo")

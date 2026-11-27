import "server-only"
import {
  ConflitoTransitorio,
  HttpError,
  ValidationError,
} from "@/lib/api/errors"
import { readQuery, validate } from "@/lib/api/http"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { lerJson } from "@/modules/movimentacoes-estoque/router"
import { autorizarRecebimento } from "@/modules/recebimentos/recebimentos.authorization"
import { chaveRecebimento } from "@/modules/recebimentos/recebimentos.schema"
import {
  consultaSchema,
  idMovimentoSchema,
  lancamentoManualSchema,
  opcoesSchema,
} from "./schema"
import {
  consultarOpcoesLancamentos,
  criarLancamento,
  detalheLancamento,
  listarLancamentos,
} from "./service"

const headers = { "Cache-Control": "private, no-store" }
async function responder(
  request: Request,
  operacao: "listar" | "criar" | "detalhe" | "opcoes",
  id?: string,
) {
  try {
    const ctx = await autorizarRecebimento(request, false)
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", headers["Cache-Control"])
      return ctx
    }
    const escrita = operacao === "criar"
    enforceRateLimit(
      request,
      {
        scope: `financeiro-lancamentos:${escrita ? "write" : "read"}`,
        limit: escrita ? 60 : 120,
        windowMs: 60000,
      },
      String(ctx.idUsuario),
    )
    if (escrita) {
      if (new URL(request.url).search)
        throw new ValidationError(
          "Este lançamento não aceita parâmetros de busca.",
        )
      const chave = validate(
        chaveRecebimento,
        request.headers.get("Idempotency-Key"),
      )
      const dados = validate(lancamentoManualSchema, await lerJson(request))
      const r = await criarLancamento(ctx, chave, dados)
      if (!r.dados.confirmada)
        return Response.json(
          { error: r.dados.mensagem, code: "LANCAMENTO_RECUSADO" },
          { status: r.dados.status, headers },
        )
      return Response.json(
        { data: r.dados.lancamento },
        { status: r.criado ? 201 : 200, headers },
      )
    }
    const data =
      operacao === "listar"
        ? await listarLancamentos(
            ctx,
            validate(consultaSchema, readQuery(request)),
          )
        : operacao === "opcoes"
          ? await consultarOpcoesLancamentos(
              ctx,
              validate(opcoesSchema, readQuery(request)),
            )
          : await detalheLancamento(ctx, validate(idMovimentoSchema, id))
    return Response.json({ data }, { headers })
  } catch (erro) {
    if (!(erro instanceof HttpError))
      console.error("Falha na API de lançamentos financeiros.")
    return Response.json(
      {
        error:
          erro instanceof HttpError
            ? erro.message
            : "Não foi possível concluir a operação financeira.",
        ...(erro instanceof ConflitoTransitorio ? { code: erro.code } : {}),
      },
      { headers, status: erro instanceof HttpError ? erro.status : 500 },
    )
  }
}
export const listarLancamentosHandler = (r: Request) => responder(r, "listar")
export const criarLancamentoHandler = (r: Request) => responder(r, "criar")
export const opcoesLancamentosHandler = (r: Request) => responder(r, "opcoes")
export const detalheLancamentoHandler = (r: Request, id: string) =>
  responder(r, "detalhe", id)

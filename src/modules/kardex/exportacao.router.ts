import "server-only"
import { HttpError, ValidationError } from "@/lib/api/errors"
import { readQuery } from "@/lib/api/http"
import { enforceRateLimit } from "@/lib/api/rate-limit"
import { autorizar } from "@/modules/movimentacoes-estoque/movimentacoes-estoque.authorization"
import { conferir } from "@/modules/reservas/operacoes"
import { prisma } from "@/lib/prisma"
import { validarConsulta } from "./kardex.schema"
import {
  consultarExportacao,
  gerarCsv,
  gerarPdf,
  type Escopo,
} from "./exportacao"

async function exportar(request: Request, escopo: Escopo) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  }
  try {
    const ctx = await autorizar(request, "ler")
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", headers["Cache-Control"])
      return ctx
    }
    await conferir(prisma, ctx, [["RELATORIOS", "ler"]])
    enforceRateLimit(
      request,
      { scope: "estoque:exportar", limit: 12, windowMs: 60_000 },
      String(ctx.idUsuario),
    )
    const { formato, ...query } = readQuery(request)
    if (formato !== "csv" && formato !== "pdf")
      throw new ValidationError("Escolha CSV ou PDF.")
    if ("pagina" in query || "limite" in query)
      throw new ValidationError(
        "A exportação usa todos os lançamentos filtrados.",
      )
    const filtros = validarConsulta(query)
    const dados = await consultarExportacao(ctx, filtros, escopo, formato)
    const gerado = new Date()
    const body =
      formato === "csv"
        ? gerarCsv(dados, escopo, gerado)
        : await gerarPdf(dados, escopo, filtros, gerado)
    await autorizarArquivo(request, ctx)
    return new Response(body, {
      headers: {
        ...headers,
        "Content-Type":
          formato === "csv" ? "text/csv; charset=utf-8" : "application/pdf",
        "Content-Disposition": `attachment; filename="${escopo}.${formato}"`,
      },
    })
  } catch (erro) {
    return Response.json(
      {
        error:
          erro instanceof HttpError
            ? erro.message
            : "Não foi possível exportar o estoque.",
      },
      { headers, status: erro instanceof HttpError ? erro.status : 500 },
    )
  }
}

async function autorizarArquivo(
  request: Request,
  ctx: { idEmpresa: number; idUsuario: number },
) {
  const atual = await autorizar(request, "ler")
  if (atual instanceof Response)
    throw new HttpError(atual.status, "Acesso ao estoque expirado ou revogado.")
  if (atual.idEmpresa !== ctx.idEmpresa || atual.idUsuario !== ctx.idUsuario)
    throw new HttpError(403, "O contexto do relatório foi alterado.")
  await conferir(prisma, ctx, [
    ["ESTOQUE", "ler"],
    ["RELATORIOS", "ler"],
  ])
}

export const exportarKardexHandler = (request: Request) =>
  exportar(request, "kardex")
export const exportarMovimentosHandler = (request: Request) =>
  exportar(request, "movimentacoes")

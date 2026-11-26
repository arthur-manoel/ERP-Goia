import "server-only"
import { prisma } from "@/lib/prisma"
import { autorizarVenda, type ContextoVenda } from "./vendas.authorization"
import { VendaError } from "./vendas.error"
import { idVendaSchema } from "./vendas.schema"
import { montarParcelas, resumirParcelas } from "./vendas.faturamento.regras"

const headers = { "Cache-Control": "private, no-store" }

/**
 * Faturamento de uma venda: situação financeira, parcelas com o que já foi
 * recebido e todas as mudanças de status (da mais recente para a mais antiga).
 */
export async function consultarFaturamento(ctx: ContextoVenda, id: number) {
  const venda = await prisma.venda.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    select: {
      id: true,
      numero: true,
      status: true,
      status_financeiro: true,
      valor_total: true,
      contas_receber: {
        orderBy: { numero_parcela: "asc" },
        select: {
          numero_parcela: true,
          total_parcelas: true,
          data_vencimento: true,
          valor_final: true,
          situacao: true,
          pagamentos_receber: {
            where: { status: "CONFIRMADO" },
            select: { valor: true },
          },
        },
      },
      parcelas: {
        orderBy: { numero_parcela: "asc" },
        select: {
          numero_parcela: true,
          data_vencimento: true,
          valor: true,
          valor_pago: true,
          status: true,
        },
      },
      historico_status: {
        orderBy: [{ data_evento: "desc" }, { id: "desc" }],
        select: {
          id: true,
          status_anterior: true,
          status_novo: true,
          observacao: true,
          data_evento: true,
          usuario_empresa: {
            select: { usuarios: { select: { nome: true } } },
          },
        },
      },
    },
  })
  if (!venda) throw new VendaError(404, "Venda não encontrada.")

  const parcelas = montarParcelas(venda.contas_receber, venda.parcelas)
  return {
    id: venda.id,
    numero: venda.numero,
    status: venda.status,
    statusFinanceiro: venda.status_financeiro,
    total: venda.valor_total.toFixed(2),
    parcelas,
    resumoParcelas: resumirParcelas(parcelas),
    historico: venda.historico_status.map((evento) => ({
      id: evento.id,
      statusAnterior: evento.status_anterior,
      statusNovo: evento.status_novo,
      observacao: evento.observacao,
      data: evento.data_evento.toISOString(),
      usuario: evento.usuario_empresa?.usuarios.nome ?? null,
    })),
  }
}

export async function faturamentoHandler(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await autorizarVenda(request, "ler")
    if (ctx instanceof Response) {
      ctx.headers.set("Cache-Control", headers["Cache-Control"])
      return ctx
    }
    const id = idVendaSchema.safeParse((await context.params).id)
    if (!id.success) throw new VendaError(400, "ID de venda inválido.")
    return Response.json(await consultarFaturamento(ctx, id.data), { headers })
  } catch (error) {
    if (error instanceof VendaError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      )
    console.error("Falha interna ao consultar o faturamento da venda.")
    return Response.json({ error: "Erro interno." }, { status: 500, headers })
  }
}

import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { validate } from "@/lib/api/http"
import { ConflictError } from "@/lib/api/errors"
import { calcularCobranca } from "@/modules/recebimentos/recebimentos.saldo"
import {
  conferirAcessoRecebimento,
  type ContextoRecebimento,
} from "@/modules/recebimentos/recebimentos.authorization"
import { periodoSchema, type FluxoCaixaDados } from "./schema"

const zero = () => new Prisma.Decimal(0)
const soma = (valores: Prisma.Decimal[]) => {
  if (valores.some((v) => !v.isFinite() || v.lte(0)))
    throw new ConflictError(
      "Há pagamento confirmado com valor inválido. Regularize o histórico financeiro.",
    )
  return valores.reduce((s, v) => s.plus(v), zero())
}
// Datas civis da operação no Brasil; limites exclusivos evitam perder milissegundos.
const inicio = (dia: string) => new Date(`${dia}T00:00:00-03:00`)
const seguinte = (dia: string) => new Date(inicio(dia).getTime() + 86_400_000)
const civil = (data: Date) => data.toISOString().slice(0, 10)

export async function consultarFluxoCaixa(
  entrada: unknown,
  ctx: ContextoRecebimento,
  agora = new Date(),
): Promise<FluxoCaixaDados> {
  const p = validate(periodoSchema, entrada)
  const hoje = agora.toLocaleDateString("sv-SE", {
    timeZone: "America/Sao_Paulo",
  })
  return prisma.$transaction(
    async (tx) => {
      await conferirAcessoRecebimento(tx, ctx, false)
      const empresa = { id_empresa: ctx.idEmpresa }
      const periodo = {
        ...empresa,
        data_movimentacao: { gte: inicio(p.de), lt: seguinte(p.ate) },
      }
      const limiteTitulos = p.ate > hoje ? p.ate : hoje
      const [bancos, acumulado, entradas, saidas, receber, pagar, quantidade] =
        await Promise.all([
          tx.contas_bancarias.aggregate({
            where: { ...empresa, data_cadastro: { lt: seguinte(p.ate) } },
            _sum: { saldo_inicial: true },
          }),
          tx.movimentacoes_financeiras.groupBy({
            by: ["tipo"],
            where: { ...empresa, data_movimentacao: { lt: seguinte(p.ate) } },
            _sum: { valor: true },
          }),
          tx.movimentacoes_financeiras.aggregate({
            where: { ...periodo, tipo: "ENTRADA" },
            _sum: { valor: true },
          }),
          tx.movimentacoes_financeiras.aggregate({
            where: { ...periodo, tipo: "SAIDA" },
            _sum: { valor: true },
          }),
          tx.contas_receber.findMany({
            where: {
              ...empresa,
              situacao: { notIn: ["PAGO", "CANCELADO"] },
              data_vencimento: { lte: new Date(`${limiteTitulos}T00:00:00Z`) },
            },
            include: {
              pagamentos_receber: {
                where: { ...empresa, status: "CONFIRMADO" },
              },
              pedido_credito_receber: { where: empresa },
            },
          }),
          tx.contas_pagar.findMany({
            where: {
              ...empresa,
              situacao: { notIn: ["PAGO", "CANCELADO"] },
              data_vencimento: { lte: new Date(`${limiteTitulos}T00:00:00Z`) },
            },
            include: {
              pagamentos_pagar: { where: { ...empresa, status: "CONFIRMADO" } },
            },
          }),
          tx.movimentacoes_financeiras.count({ where: periodo }),
        ])
      const totalPaginas = Math.ceil(quantidade / 25)
      const pagina = Math.min(p.pagina, Math.max(1, totalPaginas))
      const movimentos = await tx.movimentacoes_financeiras.findMany({
        where: periodo,
        orderBy: [{ data_movimentacao: "desc" }, { id: "desc" }],
        skip: (pagina - 1) * 25,
        take: 25,
      })
      let aReceber = zero(),
        aPagar = zero(),
        vencidoReceber = zero(),
        vencidoPagar = zero(),
        vencidos = 0
      const acumular = (
        tipo: "receber" | "pagar",
        data: Date,
        saldo: Prisma.Decimal,
      ) => {
        if (saldo.lt(0))
          throw new ConflictError(
            "Pagamento excede o valor do título. Regularize o histórico financeiro.",
          )
        if (saldo.isZero()) return
        const vencimento = civil(data)
        if (vencimento <= p.ate) {
          if (tipo === "receber") aReceber = aReceber.plus(saldo)
          else aPagar = aPagar.plus(saldo)
        }
        if (vencimento < hoje) {
          vencidos++
          if (tipo === "receber") vencidoReceber = vencidoReceber.plus(saldo)
          else vencidoPagar = vencidoPagar.plus(saldo)
        }
      }
      for (const titulo of receber) {
        const saldo = calcularCobranca(
          titulo.valor_final,
          soma(titulo.pagamentos_receber.map((r) => r.valor)),
          titulo.pedido_credito_receber,
        ).saldo
        acumular("receber", titulo.data_vencimento, saldo)
      }
      for (const titulo of pagar)
        acumular(
          "pagar",
          titulo.data_vencimento,
          titulo.valor_final.minus(
            soma(titulo.pagamentos_pagar.map((r) => r.valor)),
          ),
        )
      const valorEntradas = entradas._sum.valor ?? zero()
      const valorSaidas = saidas._sum.valor ?? zero()
      const disponivel = acumulado.reduce(
        (s, r) =>
          r.tipo === "ENTRADA"
            ? s.plus(r._sum.valor ?? 0)
            : s.minus(r._sum.valor ?? 0),
        bancos._sum.saldo_inicial ?? zero(),
      )
      return {
        entradas: valorEntradas.toFixed(2),
        saidas: valorSaidas.toFixed(2),
        saldoPeriodo: valorEntradas.minus(valorSaidas).toFixed(2),
        saldoDisponivel: disponivel.toFixed(2),
        aReceber: aReceber.toFixed(2),
        aPagar: aPagar.toFixed(2),
        saldoProjetado: disponivel.plus(aReceber).minus(aPagar).toFixed(2),
        atrasados: {
          quantidade: vencidos,
          receber: vencidoReceber.toFixed(2),
          pagar: vencidoPagar.toFixed(2),
        },
        movimentos: movimentos.map((r) => ({
          id: r.id,
          descricao: r.descricao,
          tipo: r.tipo,
          data: r.data_movimentacao.toISOString(),
          valor: r.valor.toFixed(2),
        })),
        pagina,
        totalPaginas,
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
}

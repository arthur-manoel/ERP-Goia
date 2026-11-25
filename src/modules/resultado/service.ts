import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { validate } from "@/lib/api/http"
import { ConflictError } from "@/lib/api/errors"
import { periodoResultadoSchema } from "./schema"
import {
  conferirAcessoRecebimento,
  type ContextoRecebimento,
} from "@/modules/recebimentos/recebimentos.authorization"
import { calcularResultado, type GrupoResultado } from "./calculo"

export async function consultarResultado(
  entrada: unknown,
  ctx: ContextoRecebimento,
) {
  const p = validate(periodoResultadoSchema, entrada)
  const data = {
    gte: new Date(`${p.de}T00:00:00Z`),
    lte: new Date(`${p.ate}T00:00:00Z`),
  }
  return prisma.$transaction(
    async (tx) => {
      await conferirAcessoRecebimento(tx, ctx, false)
      const empresa = { id_empresa: ctx.idEmpresa }
      const [receitas, custos, despesas, categorias, titulosCreditados] =
        await Promise.all([
          tx.contas_receber.groupBy({
            by: ["id_categoria"],
            where: {
              ...empresa,
              situacao: { not: "CANCELADO" },
              data_vencimento: data,
            },
            _sum: { valor_final: true },
          }),
          tx.contas_pagar.groupBy({
            by: ["id_categoria"],
            where: {
              ...empresa,
              situacao: { not: "CANCELADO" },
              data_vencimento: data,
            },
            _sum: { valor_final: true },
          }),
          // Despesas vinculadas já estão representadas pelo título a pagar.
          tx.despesas.groupBy({
            by: ["id_categoria"],
            where: {
              ...empresa,
              situacao: { not: "CANCELADA" },
              id_conta_pagar: null,
              data_despesa: data,
            },
            _sum: { valor: true },
          }),
          tx.categoria_financeira.findMany({
            where: empresa,
            select: { id: true, nome: true },
          }),
          tx.contas_receber.findMany({
            where: {
              ...empresa,
              situacao: { not: "CANCELADO" },
              data_vencimento: data,
              pedido_credito_receber: { some: empresa },
            },
            select: {
              id_categoria: true,
              valor_final: true,
              pedido_credito_receber: {
                where: empresa,
                select: { valor: true },
              },
            },
          }),
        ])
      // Créditos preservam valor_final e abrangem saldo anulado e restituição.
      // Deduzir o crédito completo uma vez evita depender da data do reembolso.
      const creditosPorCategoria = new Map<number, Prisma.Decimal>()
      for (const titulo of titulosCreditados) {
        const creditos = titulo.pedido_credito_receber.reduce(
          (soma, credito) => {
            if (!credito.valor.isFinite() || credito.valor.lte(0))
              throw new ConflictError(
                "Há crédito inválido no histórico financeiro.",
              )
            return soma.plus(credito.valor)
          },
          new Prisma.Decimal(0),
        )
        if (creditos.gt(titulo.valor_final))
          throw new ConflictError(
            "Créditos excedem o valor do título. Regularize o histórico financeiro.",
          )
        creditosPorCategoria.set(
          titulo.id_categoria,
          (
            creditosPorCategoria.get(titulo.id_categoria) ??
            new Prisma.Decimal(0)
          ).plus(creditos),
        )
      }
      const nomes = new Map(categorias.map((c) => [c.id, c.nome]))
      const grupos: GrupoResultado[] = []
      for (const [tipo, registros] of [
        ["Receita", receitas],
        ["Custo", custos],
      ] as const)
        for (const r of registros)
          grupos.push({
            tipo,
            categoria: nomes.get(r.id_categoria) ?? "Categoria indisponível",
            valor: (r._sum.valor_final ?? new Prisma.Decimal(0))
              .minus(
                tipo === "Receita"
                  ? (creditosPorCategoria.get(r.id_categoria) ?? 0)
                  : 0,
              )
              .toFixed(2),
          })
      for (const r of despesas)
        grupos.push({
          tipo: "Despesa",
          categoria: nomes.get(r.id_categoria) ?? "Categoria indisponível",
          valor: (r._sum.valor ?? new Prisma.Decimal(0)).toFixed(2),
        })
      grupos.sort((a, b) => {
        const ordem = { Receita: 0, Custo: 1, Despesa: 2 }
        return (
          ordem[a.tipo] - ordem[b.tipo] ||
          a.categoria.localeCompare(b.categoria, "pt-BR")
        )
      })
      return calcularResultado(grupos)
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
}

import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { ConflictError } from "@/lib/api/errors"

export async function conferirSaldoGrade(
  tx: Prisma.TransactionClient,
  ctx: { idEmpresa: number },
  produto: number,
  local: number,
  variacao: number,
  saldo: Prisma.Decimal,
) {
  const grupos = await tx.movimentacao_estoque.groupBy({
    where: {
      id_empresa: ctx.idEmpresa,
      id_produto: produto,
      id_local_estoque: local,
      id_variacao: variacao,
    },
    by: ["tipo"],
    _sum: { quantidade: true },
  })
  const entradas = new Set([
    "ENTRADA_NF",
    "ENTRADA_PRODUCAO",
    "AJUSTE_ENTRADA",
    "TRANSFERENCIA_ENTRADA",
  ])
  const apurado = grupos.reduce(
    (s, g) =>
      entradas.has(g.tipo)
        ? s.plus(g._sum.quantidade ?? 0)
        : s.minus(g._sum.quantidade ?? 0),
    new Prisma.Decimal(0),
  )
  if (!apurado.eq(saldo))
    throw new ConflictError(
      "O saldo da variação diverge do livro de estoque. Regularização necessária.",
    )
}

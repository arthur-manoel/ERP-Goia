import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { ConflictError, NotFoundError } from "@/lib/api/errors"
import { conferirSaldoGrade } from "./estoque.grade-saldo"

/** Detalhamento da mesma posição; físico agregado e kardex seguem no livro oficial. */
export async function atualizarGradeEstoque(
  tx: Prisma.TransactionClient,
  ctx: { idEmpresa: number },
  estoque: {
    id: number
    id_produto: number
    quantidade: Prisma.Decimal
    quantidade_reservada: Prisma.Decimal
  },
  idVariacao: number | undefined,
  delta: Prisma.Decimal,
) {
  const totais = await tx.estoque_variacao.aggregate({
    where: { id_estoque: estoque.id, id_empresa: ctx.idEmpresa },
    _sum: { quantidade: true, quantidade_reservada: true },
  })
  if (
    new Prisma.Decimal(totais._sum.quantidade ?? 0).gt(estoque.quantidade) ||
    new Prisma.Decimal(totais._sum.quantidade_reservada ?? 0).gt(
      estoque.quantidade_reservada,
    )
  )
    throw new ConflictError(
      "O detalhamento da grade diverge da posição agregada.",
    )
  if (!idVariacao) {
    if (delta.isNegative()) {
      const grade = totais
      const indisponivel = new Prisma.Decimal(grade._sum.quantidade ?? 0)
        .plus(estoque.quantidade_reservada)
        .minus(grade._sum.quantidade_reservada ?? 0)
      if (estoque.quantidade.plus(delta).lt(indisponivel))
        throw new ConflictError(
          "A quantidade pertence a variações. Informe a cor/tamanho correspondente.",
        )
    }
    return
  }
  const variacao = await tx.produto_variacoes.findFirst({
    where: {
      id: idVariacao,
      id_empresa: ctx.idEmpresa,
      id_produto: estoque.id_produto,
      status: "ATIVO",
    },
    include: { cores: true, tamanhos: true },
  })
  if (
    !variacao ||
    (variacao.cores &&
      (variacao.cores.status !== "ATIVA" ||
        (variacao.cores.id_empresa !== null &&
          variacao.cores.id_empresa !== ctx.idEmpresa))) ||
    (variacao.tamanhos &&
      (variacao.tamanhos.status !== "ATIVO" ||
        (variacao.tamanhos.id_empresa !== null &&
          variacao.tamanhos.id_empresa !== ctx.idEmpresa)))
  )
    throw new NotFoundError(
      "Variação ativa não encontrada para o produto na empresa.",
    )
  const atual = await tx.estoque_variacao.findUnique({
    where: {
      id_estoque_id_variacao: {
        id_estoque: estoque.id,
        id_variacao: idVariacao,
      },
    },
  })
  const quantidade = (atual?.quantidade ?? new Prisma.Decimal(0)).plus(delta)
  const posicao = await tx.estoque.findUniqueOrThrow({
    where: { id: estoque.id },
    select: { id_local_estoque: true },
  })
  await conferirSaldoGrade(
    tx,
    ctx,
    estoque.id_produto,
    posicao.id_local_estoque,
    idVariacao,
    atual?.quantidade ?? new Prisma.Decimal(0),
  )
  if (quantidade.lt(atual?.quantidade_reservada ?? 0) || quantidade.lt(0))
    throw new ConflictError(
      "Saldo disponível insuficiente nesta variação e localização.",
    )
  if (atual)
    await tx.estoque_variacao.update({
      where: { id: atual.id },
      data: { quantidade },
    })
  else
    await tx.estoque_variacao.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_produto: estoque.id_produto,
        id_estoque: estoque.id,
        id_variacao: idVariacao,
        quantidade,
      },
    })
}

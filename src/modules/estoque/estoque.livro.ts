import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { ConflictError, NotFoundError } from "@/lib/api/errors"

type Tx = Prisma.TransactionClient
type Contexto = { idEmpresa: number; idUsuario: number }
type Posicao = { idProduto: number; idLocalEstoque: number; idSetor: number }
const limite = new Prisma.Decimal("999999999999.999")
const entradas = new Set<string>([
  "ENTRADA_NF",
  "ENTRADA_PRODUCAO",
  "AJUSTE_ENTRADA",
  "TRANSFERENCIA_ENTRADA",
])
function escopo(
  ctx: Contexto,
  pos: Pick<Posicao, "idProduto" | "idLocalEstoque">,
) {
  return {
    id_empresa: ctx.idEmpresa,
    id_produto: pos.idProduto,
    id_local_estoque: pos.idLocalEstoque,
  }
}

/** Mesmo lock, inclusive antes da primeira posição, para os dois escritores. */
export async function bloquearProdutoEstoque(
  tx: Tx,
  ctx: Contexto,
  idProduto: number,
) {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM produto_empresa
    WHERE id_empresa = ${ctx.idEmpresa} AND id_produto = ${idProduto} FOR UPDATE`
  if (!rows.length)
    throw new NotFoundError("Produto não encontrado na empresa.")
}

export async function apurarSaldoEstoque(
  tx: Tx,
  ctx: Contexto,
  pos: Pick<Posicao, "idProduto" | "idLocalEstoque">,
) {
  const grupos = await tx.movimentacao_estoque.groupBy({
    by: ["tipo"],
    where: escopo(ctx, pos),
    _sum: { quantidade: true },
    _count: { _all: true },
  })
  let saldo = new Prisma.Decimal(0),
    registros = 0
  for (const grupo of grupos) {
    const valor = grupo._sum.quantidade ?? new Prisma.Decimal(0)
    saldo = entradas.has(grupo.tipo) ? saldo.plus(valor) : saldo.minus(valor)
    registros += grupo._count._all
  }
  return { saldo, registros }
}

function divergencia(): never {
  throw new ConflictError(
    "Saldo armazenado diverge das movimentações. Regularize o histórico antes de movimentar.",
  )
}

/**
 * Recupera SOMENTE a omissão identificável no antigo recebimento de compras.
 * Não usa a diferença projeção - histórico como prova: exige cada kardex,
 * sua continuidade, o tipo/origem conhecidos e o saldo final da posição.
 */
async function comprovarAberturaDeCompras(
  tx: Tx,
  ctx: Contexto,
  pos: Posicao,
  quantidade: Prisma.Decimal,
  registros: number,
) {
  const movimentos = await tx.movimentacao_estoque.findMany({
    where: escopo(ctx, pos),
    include: { kardex: true },
    orderBy: { id: "asc" },
  })
  if (!movimentos.length || movimentos.length !== registros) divergencia()
  const primeiro = movimentos[0]
  const abertura = primeiro.kardex?.saldo_anterior
  if (!abertura || !abertura.isPositive() || abertura.greaterThan(limite))
    divergencia()
  let anterior = abertura
  for (const mov of movimentos) {
    const k = mov.kardex
    if (
      mov.tipo !== "ENTRADA_NF" ||
      mov.origem_tipo !== "COMPRA_RECEBIMENTO" ||
      mov.id_setor !== pos.idSetor ||
      !mov.quantidade.isPositive() ||
      !k ||
      k.id_empresa !== ctx.idEmpresa ||
      k.id_produto !== pos.idProduto ||
      k.id_local_estoque !== pos.idLocalEstoque ||
      k.id_setor !== pos.idSetor ||
      k.tipo_movimentacao !== "ENTRADA" ||
      !k.quantidade.equals(mov.quantidade) ||
      !k.saldo_anterior.equals(anterior) ||
      !k.saldo_atual.equals(anterior.plus(mov.quantidade))
    )
      divergencia()
    anterior = k.saldo_atual
  }
  if (!anterior.equals(quantidade)) divergencia()
  // O movimento de abertura vem antes do primeiro recebimento no livro;
  // a auditoria registra agora a criação e os IDs que comprovam a origem.
  const data = new Date(primeiro.data_movimentacao.getTime() - 1000)
  if (!Number.isFinite(data.getTime()) || data.getTime() < 1000) divergencia()
  return {
    saldo: abertura,
    data,
    primeiro: primeiro.id,
    ultimo: movimentos.at(-1)!.id,
  }
}

/** Exige o lock de bloquearProdutoEstoque e a transação de quem escreve. */
export async function prepararSaldoEstoque(
  tx: Tx,
  ctx: Contexto,
  pos: Posicao,
  estoque: { quantidade: Prisma.Decimal } | null,
) {
  const historico = await apurarSaldoEstoque(tx, ctx, pos)
  let abertura = new Prisma.Decimal(0)
  let prova: Awaited<ReturnType<typeof comprovarAberturaDeCompras>> | undefined
  if (estoque && !estoque.quantidade.equals(historico.saldo)) {
    if (!historico.registros) abertura = estoque.quantidade
    else {
      prova = await comprovarAberturaDeCompras(
        tx,
        ctx,
        pos,
        estoque.quantidade,
        historico.registros,
      )
      abertura = prova.saldo
      if (!historico.saldo.plus(abertura).equals(estoque.quantidade))
        divergencia()
    }
  }
  const saldo = historico.saldo.plus(abertura)
  if (abertura.isNegative() || saldo.isNegative() || saldo.greaterThan(limite))
    throw new ConflictError(
      "Saldo legado ou histórico de estoque inválido; regularize antes de movimentar.",
    )
  if (abertura.isZero()) return { saldo, idMovimentacaoAbertura: null }
  const movimento = await tx.movimentacao_estoque.create({
    data: {
      ...escopo(ctx, pos),
      id_setor: pos.idSetor,
      tipo: "AJUSTE_ENTRADA",
      quantidade: abertura,
      id_usuario: ctx.idUsuario,
      origem_tipo: "SALDO_INICIAL",
      observacao: prova
        ? "Abertura de saldo legado comprovada pelo kardex de compras"
        : "Abertura do saldo legado sem movimentações",
      ...(prova ? { data_movimentacao: prova.data } : {}),
    },
  })
  await tx.kardex.create({
    data: {
      ...escopo(ctx, pos),
      id_setor: pos.idSetor,
      id_movimentacao: movimento.id,
      tipo_movimentacao: "ENTRADA",
      quantidade: abertura,
      saldo_anterior: new Prisma.Decimal(0),
      saldo_atual: abertura,
      ...(prova ? { data_movimentacao: prova.data } : {}),
    },
  })
  await tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela: "movimentacao_estoque",
      id_registro: movimento.id,
      acao: "INSERT",
      dados_anteriores: JSON.stringify({ saldo: historico.saldo.toFixed(3) }),
      dados_novos: JSON.stringify({
        ...pos,
        operacao: "SALDO_INICIAL",
        quantidade: abertura.toFixed(3),
        saldo: saldo.toFixed(3),
        fundamento: prova ? "KARDEX_COMPRAS" : "POSICAO_SEM_MOVIMENTOS",
        ...(prova
          ? {
              idPrimeiroMovimento: prova.primeiro,
              idUltimoMovimento: prova.ultimo,
            }
          : {}),
      }),
    },
  })
  return { saldo, idMovimentacaoAbertura: movimento.id }
}

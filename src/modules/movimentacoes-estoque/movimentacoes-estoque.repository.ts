import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { ConflictError, NotFoundError } from "@/lib/api/errors"
import type { Contexto } from "./movimentacoes-estoque.authorization"
import type {
  AjusteInput,
  MovimentoInput,
  Posicao,
} from "./movimentacoes-estoque.schema"
import { calcularSaldo, LIMITE } from "./movimentacoes-estoque.service"

type Tx = Prisma.TransactionClient
const entradas = [
  "ENTRADA_NF",
  "ENTRADA_PRODUCAO",
  "AJUSTE_ENTRADA",
  "TRANSFERENCIA_ENTRADA",
] as const
async function apurar(
  tx: Tx,
  ctx: Contexto,
  pos: Pick<Posicao, "idProduto" | "idLocalEstoque">,
) {
  const where = {
    id_empresa: ctx.idEmpresa,
    id_produto: pos.idProduto,
    id_local_estoque: pos.idLocalEstoque,
  }
  const grupos = await tx.movimentacao_estoque.groupBy({
    by: ["tipo"],
    where,
    _sum: { quantidade: true },
    _count: { _all: true },
  })
  let saldo = new Prisma.Decimal(0),
    registros = 0
  for (const grupo of grupos) {
    const valor = grupo._sum.quantidade ?? new Prisma.Decimal(0)
    saldo = entradas.some((tipo) => tipo === grupo.tipo)
      ? saldo.plus(valor)
      : saldo.minus(valor)
    registros += grupo._count._all
  }
  return { saldo, registros }
}
async function validarPosicao(
  tx: Tx,
  ctx: Contexto,
  pos: Pick<Posicao, "idProduto" | "idLocalEstoque">,
) {
  const produto = await tx.produto_empresa.findFirst({
    where: {
      id_empresa: ctx.idEmpresa,
      id_produto: pos.idProduto,
      status: "ATIVO",
      produtos: { status: "ATIVO", controla_estoque: true },
    },
  })
  const local = await tx.locais_estoque.findFirst({
    where: {
      id: pos.idLocalEstoque,
      id_empresa: ctx.idEmpresa,
      status: "ATIVO",
    },
  })
  if (!produto || !local)
    throw new NotFoundError("Produto ou local ativo não encontrado na empresa.")
}
async function registrar(
  tx: Tx,
  ctx: Contexto,
  pos: Posicao,
  anterior: Prisma.Decimal,
  delta: Prisma.Decimal,
  observacao: string,
  origem: string,
) {
  const atual = anterior.plus(delta)
  const movimento = await tx.movimentacao_estoque.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_local_estoque: pos.idLocalEstoque,
      id_setor: pos.idSetor,
      id_produto: pos.idProduto,
      tipo: delta.isPositive() ? "AJUSTE_ENTRADA" : "AJUSTE_SAIDA",
      quantidade: delta.abs(),
      id_usuario: ctx.idUsuario,
      observacao,
      origem_tipo: origem,
    },
  })
  await tx.kardex.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_local_estoque: pos.idLocalEstoque,
      id_setor: pos.idSetor,
      id_produto: pos.idProduto,
      id_movimentacao: movimento.id,
      tipo_movimentacao: delta.isPositive() ? "ENTRADA" : "SAIDA",
      quantidade: delta.abs(),
      saldo_anterior: anterior,
      saldo_atual: atual,
    },
  })
  await tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela: "movimentacao_estoque",
      id_registro: movimento.id,
      acao: "INSERT",
      dados_anteriores: JSON.stringify({ saldo: anterior.toFixed(3) }),
      dados_novos: JSON.stringify({
        idProduto: pos.idProduto,
        idLocalEstoque: pos.idLocalEstoque,
        idSetor: pos.idSetor,
        operacao: origem,
        quantidade: delta.abs().toFixed(3),
        saldo: atual.toFixed(3),
        observacao,
      }),
    },
  })
  return movimento.id
}
export async function movimentar(
  ctx: Contexto,
  dados: MovimentoInput | AjusteInput,
  operacao: "entrada" | "saida" | "ajuste",
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        // Existe mesmo antes da primeira posição. Todas as escritas deste produto
        // aguardam o mesmo lock, inclusive quando locais diferentes são usados.
        const lock = await tx.$queryRaw<
          { id: number }[]
        >`SELECT id FROM produto_empresa WHERE id_empresa = ${ctx.idEmpresa} AND id_produto = ${dados.idProduto} FOR UPDATE`
        if (!lock.length)
          throw new NotFoundError("Produto não encontrado na empresa.")
        await validarPosicao(tx, ctx, dados)
        const setor = await tx.setores.findFirst({
          where: {
            id: dados.idSetor,
            id_empresa: ctx.idEmpresa,
            status: "ATIVO",
          },
        })
        if (!setor)
          throw new NotFoundError("Setor ativo não encontrado na empresa.")
        const chave = {
          id_empresa: ctx.idEmpresa,
          id_local_estoque: dados.idLocalEstoque,
          id_produto: dados.idProduto,
        }
        let estoque = await tx.estoque.findUnique({
          where: { id_empresa_id_local_estoque_id_produto: chave },
        })
        if (estoque && estoque.id_setor !== dados.idSetor)
          throw new ConflictError("A posição pertence a outro setor.")
        const historico = await apurar(tx, ctx, dados)
        let anterior = historico.saldo
        let idMovimentacaoAbertura: number | null = null
        if (estoque && !historico.registros && !estoque.quantidade.isZero()) {
          if (
            estoque.quantidade.isNegative() ||
            estoque.quantidade.greaterThan(LIMITE)
          )
            throw new ConflictError(
              "Saldo legado inválido; regularize antes de movimentar.",
            )
          idMovimentacaoAbertura = await registrar(
            tx,
            ctx,
            dados,
            new Prisma.Decimal(0),
            estoque.quantidade,
            "Abertura do saldo legado sem movimentações",
            "SALDO_INICIAL",
          )
          anterior = estoque.quantidade
        } else if (estoque && !estoque.quantidade.equals(anterior)) {
          throw new ConflictError(
            "Saldo armazenado diverge das movimentações. Regularize o histórico antes de movimentar.",
          )
        }
        if (anterior.isNegative() || anterior.greaterThan(LIMITE))
          throw new ConflictError("Histórico de estoque inválido.")
        const ajuste = "saldoNovo" in dados
        const { atual, delta } = calcularSaldo(
          anterior,
          ajuste ? dados.saldoNovo : dados.quantidade,
          operacao,
          ajuste ? dados.saldoEsperado : undefined,
        )
        if (!estoque)
          estoque = await tx.estoque.create({
            data: { ...chave, id_setor: dados.idSetor, quantidade: anterior },
          })
        // A condição também detecta escritores externos que alteraram a projeção.
        const resultado = await tx.estoque.updateMany({
          where: {
            id: estoque.id,
            id_empresa: ctx.idEmpresa,
            quantidade: anterior,
          },
          data: { quantidade: atual, data_atualizacao: new Date() },
        })
        if (resultado.count !== 1)
          throw new ConflictError("O saldo mudou durante a operação.")
        const idMovimentacao = await registrar(
          tx,
          ctx,
          dados,
          anterior,
          delta,
          dados.observacao,
          `API_${operacao.toUpperCase()}`,
        )
        return {
          idMovimentacao,
          idMovimentacaoAbertura,
          idProduto: dados.idProduto,
          idLocalEstoque: dados.idLocalEstoque,
          idSetor: dados.idSetor,
          operacao,
          quantidade: delta.abs().toFixed(3),
          saldoAnterior: anterior.toFixed(3),
          saldoAtual: atual.toFixed(3),
        }
      },
      { isolationLevel: "Serializable", maxWait: 10000, timeout: 15000 },
    )
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2003", "P2025", "P2028", "P2034"].includes(error.code)
    )
      throw new ConflictError(
        "Conflito no estoque. Consulte o saldo e tente novamente.",
      )
    throw error
  }
}
export async function consultarSaldo(
  ctx: Contexto,
  pos: Pick<Posicao, "idProduto" | "idLocalEstoque">,
) {
  return prisma.$transaction(
    async (tx) => {
      await validarPosicao(tx, ctx, pos)
      const historico = await apurar(tx, ctx, pos)
      const estoque = await tx.estoque.findUnique({
        where: {
          id_empresa_id_local_estoque_id_produto: {
            id_empresa: ctx.idEmpresa,
            id_local_estoque: pos.idLocalEstoque,
            id_produto: pos.idProduto,
          },
        },
      })
      return {
        ...pos,
        saldo: historico.saldo.toFixed(3),
        saldoArmazenado: estoque?.quantidade.toFixed(3) ?? "0.000",
        quantidadeReservada:
          estoque?.quantidade_reservada.toFixed(3) ?? "0.000",
        movimentos: historico.registros,
        precisaAbertura:
          historico.registros === 0 &&
          Boolean(estoque && !estoque.quantidade.isZero()),
        consistente: historico.saldo.equals(estoque?.quantidade ?? 0),
      }
    },
    { isolationLevel: "RepeatableRead" },
  )
}

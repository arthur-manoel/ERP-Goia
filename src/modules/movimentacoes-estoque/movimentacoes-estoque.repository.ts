import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { ConflictError, NotFoundError } from "@/lib/api/errors"
import { disputaPersistencia } from "@/lib/prisma-concorrencia"
import {
  apurarSaldoEstoque,
  bloquearProdutoEstoque,
  prepararSaldoEstoque,
} from "@/modules/estoque/estoque.livro"
import type { Contexto } from "./movimentacoes-estoque.authorization"
import type {
  AjusteInput,
  MovimentoInput,
  Posicao,
} from "./movimentacoes-estoque.schema"
import { calcularSaldo } from "./movimentacoes-estoque.service"

type Tx = Prisma.TransactionClient
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
        await bloquearProdutoEstoque(tx, ctx, dados.idProduto)
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
        const { saldo: anterior, idMovimentacaoAbertura } =
          await prepararSaldoEstoque(tx, ctx, dados, estoque)
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
      disputaPersistencia(error) ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2003", "P2025", "P2028"].includes(error.code))
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
      const historico = await apurarSaldoEstoque(tx, ctx, pos)
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

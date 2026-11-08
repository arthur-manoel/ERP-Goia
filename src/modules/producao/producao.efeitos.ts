import "server-only"
import { Prisma } from "@/generated/prisma/client"
import type { Contexto, Transaction } from "./producao.repository"

export function entradasProducaoComprovadas(
  idOP: number,
  itens: {
    id: number
    id_produto: number
    quantidade_produzida: Prisma.Decimal
  }[],
  entradas: {
    chave_operacao: string | null
    id_produto: number
    quantidade: Prisma.Decimal
  }[],
  perdas: ReadonlySet<number>,
) {
  const itensComEntrada = itens.filter((item) => !perdas.has(item.id))
  const porChave = new Map(
    entradas.map((entrada) => [entrada.chave_operacao, entrada]),
  )
  return (
    itens.length > 0 &&
    entradas.length === itensComEntrada.length &&
    itensComEntrada.every((item) => {
      const entrada = porChave.get(`op:${idOP}:item:${item.id}`)
      return (
        item.quantidade_produzida.gt(0) &&
        entrada?.id_produto === item.id_produto &&
        entrada.quantidade.eq(item.quantidade_produzida)
      )
    })
  )
}

/** Descreve registros já gravados na transação; não cria nem reconstrói efeitos. */
export async function lerEfeitosProducao(
  tx: Transaction,
  ctx: Contexto,
  idOP: number,
  perdas: ReadonlySet<number>,
) {
  const [entradas, consumos, necessidades, itens] = await Promise.all([
    tx.movimentacao_estoque.findMany({
      where: {
        id_empresa: ctx.idEmpresa,
        origem_tipo: "ORDEM_PRODUCAO",
        origem_id: idOP,
        tipo: "ENTRADA_PRODUCAO",
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        id_produto: true,
        id_variacao: true,
        id_local_estoque: true,
        id_setor: true,
        id_usuario: true,
        quantidade: true,
        produtos: { select: { unidade: true } },
        origem_tipo: true,
        origem_id: true,
        chave_operacao: true,
      },
    }),
    tx.consumo_producao.findMany({
      where: {
        id_ordem_producao: idOP,
        ordem_producao: { id_empresa: ctx.idEmpresa },
      },
      orderBy: { id: "asc" },
      include: { movimentacao_estoque: true },
    }),
    tx.necessidade_producao.findMany({
      where: {
        id_ordem_producao: idOP,
        ordem_producao: { id_empresa: ctx.idEmpresa },
      },
      orderBy: { id: "asc" },
    }),
    tx.ordem_producao_item.findMany({
      where: {
        id_ordem_producao: idOP,
        ordem_producao: { id_empresa: ctx.idEmpresa },
      },
      orderBy: { id: "asc" },
    }),
  ])
  const entradaIntegra = entradasProducaoComprovadas(
    idOP,
    itens,
    entradas,
    perdas,
  )
  const consumoIntegro =
    necessidades.length > 0 &&
    necessidades.every(
      (n) =>
        n.consumo_confirmado_em &&
        n.status === "CONSUMIDA" &&
        consumos
          .filter((c) => c.id_necessidade_producao === n.id)
          .reduce((s, c) => s.plus(c.quantidade), new Prisma.Decimal(0))
          .eq(n.quantidade_consumida),
    ) &&
    consumos.every(
      (c) =>
        c.movimentacao_estoque?.id_empresa === ctx.idEmpresa &&
        c.movimentacao_estoque.tipo === "SAIDA_PRODUCAO" &&
        c.movimentacao_estoque.id_produto === c.id_produto &&
        c.movimentacao_estoque.origem_id === idOP &&
        c.movimentacao_estoque.quantidade.eq(c.quantidade),
    )
  return {
    evento: "CONCLUSAO_PRODUCAO",
    entradaProdutos: {
      situacao: entradaIntegra ? "EFETIVADA" : "PENDENTE_REGULARIZACAO",
      movimentos: entradas.map((m) => ({
        ...m,
        quantidade: m.quantidade.toFixed(3),
        unidade: m.produtos.unidade,
      })),
    },
    consumoInsumos: {
      situacao: consumoIntegro ? "CONFIRMADO" : "PENDENTE_REGULARIZACAO",
      materiais: necessidades.map((n) => ({
        idNecessidade: n.id,
        idProduto: n.id_produto,
        quantidadePlanejada: n.quantidade_necessaria.toFixed(3),
        quantidadeConsumida: n.quantidade_consumida.toFixed(3),
        confirmadoEm: n.consumo_confirmado_em?.toISOString() ?? null,
      })),
      movimentos: consumos.map((c) => ({
        idConsumo: c.id,
        idMovimentacao: c.id_movimentacao_estoque,
        idReserva: c.id_reserva_estoque,
        idProduto: c.id_produto,
        quantidade: c.quantidade.toFixed(3),
      })),
    },
  }
}

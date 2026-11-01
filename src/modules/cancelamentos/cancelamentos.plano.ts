import "server-only"
import { createHash } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { ConflictError, NotFoundError } from "@/lib/api/errors"
import type { Contexto, Tx } from "@/modules/reservas/operacoes"
import { buscarPedido } from "@/modules/pedidos/pedidos.repository"
import {
  buscarFechamento,
  buscarCreditos,
} from "@/modules/pedido-recebiveis/recebiveis.repository"
import { validarIntegridade } from "@/modules/pedido-recebiveis/recebiveis.integridade"
import { recebidoValido } from "@/modules/recebimentos/recebimentos.service"
import { apurarPrazo, creditoEntrega } from "./cancelamentos.calculo"
import { restante } from "@/modules/reservas/reservas.service"
import type { Escopo } from "./cancelamentos.schema"
export async function preparar(
  tx: Tx,
  ctx: Contexto,
  idPedido: number,
  escopo: Escopo,
) {
  const pedido = await buscarPedido(tx, ctx, idPedido)
  if (pedido.status === "CANCELADO")
    throw new ConflictError(
      "O pedido já está cancelado. Consulte seu histórico.",
    )
  const fechamento = await buscarFechamento(tx, ctx, idPedido)
  const fechamentoEstornado = fechamento
    ? await tx.pedido_fechamento_estorno.findUnique({
        where: { id_fechamento: fechamento.id },
      })
    : null
  const entregas = await tx.pedido_cliente_entrega.findMany({
    where: { id_pedido_cliente: idPedido },
    orderBy: { id: "asc" },
    include: {
      pedido_cliente_entrega_item: { orderBy: { id: "asc" } },
      pedido_entrega_estorno: true,
    },
  })
  const selecionadas =
    escopo.tipo === "FECHAMENTO"
      ? []
      : entregas.filter(
          (e) =>
            e.status !== "CANCELADA" &&
            (escopo.tipo === "PEDIDO" || e.id === escopo.idEntrega),
        )
  if (escopo.tipo === "ENTREGA" && !selecionadas.length)
    throw new NotFoundError("Entrega ativa não encontrada neste pedido.")
  if (escopo.tipo === "FECHAMENTO" && (!fechamento || fechamentoEstornado))
    throw new ConflictError("Fechamento não encontrado ou já estornado.")
  const reservas = await tx.reserva_estoque.findMany({
    where: {
      id_empresa: ctx.idEmpresa,
      pedido_cliente_item: { id_pedido_cliente: idPedido },
    },
    orderBy: { id: "asc" },
  })
  const movimentos = await tx.movimentacao_estoque.findMany({
    where: {
      origem_tipo: "PEDIDO_ENTREGA",
      origem_id: { in: entregas.map((e) => e.id) },
    },
    orderBy: { id: "asc" },
    include: { produtos: { select: { unidade: true } } },
  })
  const creditos = fechamento
    ? await buscarCreditos(tx, ctx, fechamento)
    : new Map<number, Prisma.pedido_credito_receberGetPayload<object>[]>()
  const anteriores = await tx.pedido_entrega_estorno.findMany({
    where: { id_empresa: ctx.idEmpresa, id_pedido_cliente: idPedido },
    orderBy: { id: "asc" },
    include: {
      pedido_cancelamento: { select: { id_fechamento_referencia: true } },
    },
  })
  const inconsistencias: string[] = []
  const fechado = Boolean(
    fechamento || pedido._count.venda || pedido.status === "CONCLUIDO",
  )
  const prazo = apurarPrazo(fechamento?.data_fechamento ?? null, fechado)
  if (prazo.inconsistente)
    inconsistencias.push(
      "Fechamento sem data histórica confiável; análise gerencial necessária.",
    )
  if (!fechamento && fechado)
    inconsistencias.push(
      "Venda ou fechamento legado sem vínculo financeiro comprovado.",
    )
  if (
    reservas.some(
      (r) =>
        r.status === "ATIVA" &&
        (!r.protocolo_integrado || !r.id_local_estoque || !r.id_setor),
    )
  )
    inconsistencias.push(
      "Há reserva legada que exige regularização pelo responsável.",
    )
  if (fechamento) {
    try {
      validarIntegridade(pedido, fechamento, creditos)
      for (const c of fechamento.venda.contas_receber)
        await recebidoValido(tx, c)
    } catch {
      inconsistencias.push(
        "Fechamento ou recebimentos inconsistentes; regularização financeira necessária.",
      )
    }
  }
  for (const entrega of selecionadas) {
    const saidas = movimentos.filter((m) => m.origem_id === entrega.id)
    const quantidades = new Map<number, Prisma.Decimal>()
    for (const m of saidas) {
      const key = new RegExp(
        `^entrega:${entrega.id}:item:(\\d+):reserva:(\\d+)$`,
      ).exec(m.chave_operacao ?? "")
      const item = pedido.pedido_cliente_item.find(
        (i) => i.id === Number(key?.[1]),
      )
      const reserva = reservas.find((r) => r.id === Number(key?.[2]))
      if (
        !key ||
        m.id_empresa !== ctx.idEmpresa ||
        m.tipo !== "SAIDA_VENDA" ||
        !item ||
        !reserva ||
        reserva.id_pedido_cliente_item !== item.id ||
        m.id_produto !== item.id_produto ||
        m.id_variacao !== item.id_variacao ||
        m.id_local_estoque !== reserva.id_local_estoque ||
        m.id_setor !== reserva.id_setor ||
        m.quantidade.lte(0) ||
        m.produtos.unidade !== item.unidade
      ) {
        inconsistencias.push(
          `Saída da entrega ${entrega.id} sem origem íntegra.`,
        )
        continue
      }
      quantidades.set(
        item.id,
        (quantidades.get(item.id) ?? new Prisma.Decimal(0)).plus(m.quantidade),
      )
    }
    if (
      (!["PREPARANDO", "NAO_ENTREGUE"].includes(entrega.status) ||
        saidas.length) &&
      entrega.pedido_cliente_entrega_item.some(
        (i) => !quantidades.get(i.id_pedido_cliente_item)?.eq(i.quantidade),
      )
    )
      inconsistencias.push(
        `Entrega ${entrega.id} sem comprovação completa de saída física.`,
      )
    if (
      quantidades.size !==
        new Set(
          entrega.pedido_cliente_entrega_item.map(
            (i) => i.id_pedido_cliente_item,
          ),
        ).size &&
      saidas.length
    )
      inconsistencias.push(`Movimentos extras na entrega ${entrega.id}.`)
  }
  let credito = new Prisma.Decimal(0)
  let rateio: ReturnType<typeof creditoEntrega>["linhas"] = []
  const creditado = [...creditos.values()]
    .flat()
    .reduce((s, c) => s.plus(c.valor), new Prisma.Decimal(0))
  if (fechamento && !fechamentoEstornado) {
    if (escopo.tipo !== "ENTREGA")
      credito = fechamento.valor_total.minus(creditado)
    else {
      const quantidadesAnteriores = new Map<number, Prisma.Decimal>()
      for (const e of anteriores.filter(
        (e) => e.pedido_cancelamento.id_fechamento_referencia === fechamento.id,
      )) {
        if (!Array.isArray(e.rateio_itens))
          throw new ConflictError("Rateio histórico inconsistente.")
        for (const value of e.rateio_itens) {
          if (
            !value ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            typeof value.idItem !== "number" ||
            typeof value.quantidade !== "string"
          )
            throw new ConflictError("Rateio histórico inconsistente.")
          quantidadesAnteriores.set(
            value.idItem,
            (
              quantidadesAnteriores.get(value.idItem) ?? new Prisma.Decimal(0)
            ).plus(value.quantidade),
          )
        }
      }
      const atuais = new Map<number, Prisma.Decimal>()
      for (const e of selecionadas)
        for (const i of e.pedido_cliente_entrega_item)
          atuais.set(
            i.id_pedido_cliente_item,
            (
              atuais.get(i.id_pedido_cliente_item) ?? new Prisma.Decimal(0)
            ).plus(i.quantidade),
          )
      const resultado = creditoEntrega(
        fechamento.valor_total,
        pedido.pedido_cliente_item,
        quantidadesAnteriores,
        atuais,
      )
      credito = resultado.valor
      rateio = resultado.linhas
    }
    if (credito.lt(0) || credito.plus(creditado).gt(fechamento.valor_total))
      throw new ConflictError("Crédito excederia o fechamento original.")
  }
  if (escopo.tipo === "PEDIDO")
    rateio = selecionadas.flatMap((e) =>
      e.pedido_cliente_entrega_item.map((i) => ({
        idItem: i.id_pedido_cliente_item,
        quantidade: i.quantidade.toFixed(3),
        valor: "0.00",
      })),
    )
  const ativas =
    escopo.tipo === "PEDIDO" ? reservas.filter((r) => r.status === "ATIVA") : []
  const efeitos = {
    tipo: escopo.tipo,
    idEntrega: escopo.idEntrega ?? null,
    reservas: ativas.map((r) => ({
      id: r.id,
      quantidade: restante(r).toFixed(3),
    })),
    entregas: selecionadas.map((e) => ({ id: e.id, status: e.status })),
    devolucoes: movimentos
      .filter((m) => selecionadas.some((e) => e.id === m.origem_id))
      .map((m) => ({
        idMovimento: m.id,
        idProduto: m.id_produto,
        idVariacao: m.id_variacao,
        idLocalOrigem: m.id_local_estoque,
        idSetorOrigem: m.id_setor,
        unidade: m.produtos.unidade,
        quantidade: m.quantidade.toFixed(3),
      })),
    credito: credito.toFixed(2),
    rateio,
    inconsistencias: [...new Set(inconsistencias)],
    fechadoEm: fechamento?.data_fechamento.toISOString() ?? null,
    limiteSemAprovacao: prazo.limite?.toISOString() ?? null,
    exigeAprovacao: prazo.exigeAprovacao || inconsistencias.length > 0,
    referenciaInconsistente: prazo.inconsistente || inconsistencias.length > 0,
    fuso: "America/Sao_Paulo",
    fiscal:
      "Estorno interno; documentos fiscais externos exigem o processo fiscal responsável.",
  }
  // Inclui mudanças financeiras, físicas e de documento; nenhuma data do cliente define a aprovação.
  const hashEstado = createHash("sha256")
    .update(
      JSON.stringify({
        escopo,
        pedido,
        fechamento,
        fechamentoEstornado,
        entregas,
        reservas,
        movimentos,
        creditos: [...creditos],
        anteriores,
      }),
    )
    .digest("hex")
  return {
    pedido,
    fechamento,
    selecionadas,
    reservas: ativas,
    movimentos,
    creditos,
    credito,
    rateio,
    efeitos,
    hashEstado,
    prazo,
  }
}
export type Plano = Awaited<ReturnType<typeof preparar>>
export function mostrarPrevia(p: Plano, financeiro: boolean) {
  return {
    hashEstado: p.hashEstado,
    ...p.efeitos,
    credito: financeiro ? p.efeitos.credito : null,
    rateio: financeiro ? p.efeitos.rateio : undefined,
  }
}

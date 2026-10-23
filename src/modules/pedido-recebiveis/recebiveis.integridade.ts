import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { dinheiro, subtotal, total } from "@/modules/pedidos/pedidos.calculo"
import { PedidoError } from "@/modules/pedidos/pedidos.error"
import type { Pedido } from "@/modules/pedidos/pedidos.repository"
import { dataCivil } from "@/modules/pedidos/pedidos.calculo"
import { parcelar } from "./recebiveis.calculo"
import type { Fechamento } from "./recebiveis.repository"
import {
  hash,
  planoPersistidoSchema,
  snapshotPedido,
  snapshotSchema,
} from "./recebiveis.snapshot"

export function regularizacao(): never {
  throw new PedidoError(
    409,
    "Geração financeira não comprovada ou inconsistente. Regularização necessária.",
  )
}

// A mesma fórmula da API de pedidos; nunca consultar o preço atual do catálogo.
export function calcularPedido(pedido: Pedido) {
  if (!pedido.pedido_cliente_item.length)
    throw new PedidoError(409, "Pedido deve possuir ao menos um item.")
  for (const value of [
    pedido.valor_desconto,
    pedido.valor_frete,
    pedido.valor_acrescimo,
  ])
    dinheiro(value)
  const itens = pedido.pedido_cliente_item.map((item) => {
    if (!item.quantidade.isFinite() || item.quantidade.lte(0))
      throw new PedidoError(409, "Quantidade do pedido incompatível.")
    dinheiro(item.valor_unitario)
    dinheiro(item.valor_desconto)
    dinheiro(item.valor_acrescimo)
    return {
      id: item.id,
      valor: subtotal(
        item.quantidade.toFixed(3),
        item.valor_unitario.toFixed(2),
        item.valor_desconto.toFixed(2),
        item.valor_acrescimo.toFixed(2),
      ),
    }
  })
  const valores = total(
    itens.map((i) => i.valor),
    pedido.valor_desconto.toFixed(2),
    pedido.valor_frete.toFixed(2),
    pedido.valor_acrescimo.toFixed(2),
  )
  if (valores.total.lte(0))
    throw new PedidoError(409, "Total do pedido deve ser maior que zero.")
  return { ...valores, itens }
}

export function validarIntegridade(pedido: Pedido, fechamento: Fechamento) {
  const p = planoPersistidoSchema.safeParse(fechamento.plano_pagamento)
  const s = snapshotSchema.safeParse(fechamento.snapshot_pedido)
  if (!p.success || !s.success) regularizacao()
  const plano = p.data
  const condicao = plano.condicaoPagamento
  if (
    (condicao?.id ?? null) !== pedido.id_condicao_pagamento ||
    (condicao &&
      (condicao.numeroParcelas !== plano.vencimentos.length ||
        (condicao.numeroParcelas > 1 && !condicao.permiteParcelamento) ||
        (condicao.intervaloDias > 0 &&
          plano.vencimentos.some(
            (data, index) =>
              index > 0 &&
              dataCivil(data).getTime() -
                dataCivil(plano.vencimentos[index - 1]).getTime() !==
                condicao.intervaloDias * 86400000,
          ))))
  )
    regularizacao()
  if (
    hash(plano) !== fechamento.hash_plano ||
    hash(s.data) !== fechamento.hash_pedido ||
    hash(snapshotPedido(pedido)) !== fechamento.hash_pedido ||
    fechamento.id_empresa !== pedido.id_empresa ||
    fechamento.id_pedido_cliente !== pedido.id ||
    fechamento.id_cliente !== pedido.id_cliente ||
    fechamento.id_categoria !== plano.idCategoriaFinanceira ||
    fechamento.total_parcelas !== plano.vencimentos.length ||
    !fechamento.valor_total.eq(pedido.valor_total) ||
    pedido._count.venda !== 1 ||
    pedido._count.pedido_cliente_fechamento !== 1
  )
    regularizacao()

  const calculado = calcularPedido(pedido)
  if (
    !calculado.subtotal.eq(pedido.valor_subtotal) ||
    !calculado.total.eq(pedido.valor_total) ||
    calculado.itens.some(
      (i) =>
        !i.valor.eq(
          pedido.pedido_cliente_item.find((v) => v.id === i.id)!.valor_total,
        ),
    )
  )
    regularizacao()
  const venda = fechamento.venda
  if (
    venda.id !== fechamento.id_venda ||
    venda.id_empresa !== pedido.id_empresa ||
    venda.id_cliente !== pedido.id_cliente ||
    venda.id_pedido_cliente !== pedido.id ||
    venda.id_condicao_pagamento !== pedido.id_condicao_pagamento ||
    venda.status === "CANCELADA" ||
    venda.status_financeiro === "CANCELADA" ||
    !venda.valor_subtotal.eq(pedido.valor_subtotal) ||
    !venda.valor_total.eq(pedido.valor_total) ||
    !venda.valor_desconto.eq(pedido.valor_desconto) ||
    !venda.valor_frete.eq(pedido.valor_frete) ||
    !venda.valor_acrescimo.eq(pedido.valor_acrescimo) ||
    venda.item_venda.length !== pedido.pedido_cliente_item.length
  )
    regularizacao()
  const vendidos = new Map(
    venda.item_venda.map((i) => [i.id_pedido_cliente_item, i]),
  )
  if (vendidos.size !== pedido.pedido_cliente_item.length) regularizacao()
  for (const item of pedido.pedido_cliente_item) {
    const vendido = vendidos.get(item.id)
    if (
      !vendido ||
      item._count.item_venda !== 1 ||
      vendido.id_venda !== venda.id ||
      vendido.id_produto !== item.id_produto ||
      !vendido.quantidade.eq(item.quantidade) ||
      !vendido.valor_unitario.eq(item.valor_unitario) ||
      !vendido.valor_total.eq(item.valor_total)
    )
      regularizacao()
  }
  let parcelas: ReturnType<typeof parcelar>
  try {
    parcelas = parcelar(fechamento.valor_total, plano.vencimentos)
  } catch (error) {
    // Um plano novo inválido é 400; um plano já persistido impossível é uma
    // inconsistência histórica (409), nunca convite a completar títulos.
    if (error instanceof PedidoError) regularizacao()
    throw error
  }
  if (venda.contas_receber.length !== parcelas.length) regularizacao()
  for (const [index, conta] of venda.contas_receber.entries()) {
    const parcela = parcelas[index]
    if (
      conta.id_empresa !== pedido.id_empresa ||
      conta.id_venda !== venda.id ||
      conta.id_fechamento !== fechamento.id ||
      conta.id_categoria !== fechamento.id_categoria ||
      conta.numero_parcela !== parcela.numeroParcela ||
      conta.total_parcelas !== parcela.totalParcelas ||
      conta.data_vencimento.toISOString().slice(0, 10) !== parcela.vencimento ||
      !conta.valor_original.eq(parcela.valor) ||
      !conta.valor_final.eq(parcela.valor) ||
      !conta.valor_desconto.isZero() ||
      !conta.valor_acrescimo.isZero() ||
      conta.saldo === null ||
      conta.saldo.lt(0) ||
      conta.saldo.gt(conta.valor_final) ||
      conta.situacao === "CANCELADO"
    )
      regularizacao()
    let recebido = new Prisma.Decimal(0)
    for (const pagamento of conta.pagamentos_receber) {
      if (
        pagamento.id_empresa !== pedido.id_empresa ||
        pagamento.id_conta_receber !== conta.id ||
        pagamento.valor.lte(0)
      )
        regularizacao()
      if (pagamento.status === "CONFIRMADO")
        recebido = recebido.plus(pagamento.valor)
    }
    const saldo = conta.saldo!
    if (
      recebido.gt(conta.valor_final) ||
      !saldo.eq(conta.valor_final.minus(recebido)) ||
      (saldo.isZero() && conta.situacao !== "PAGO") ||
      (saldo.gt(0) && conta.situacao === "PAGO") ||
      (recebido.isZero() && conta.situacao === "PARCIAL") ||
      (recebido.gt(0) && saldo.gt(0) && conta.situacao === "ABERTO")
    )
      regularizacao()
  }
  return { plano, parcelas }
}

import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { auditFinancial } from "../../../modules/financeiro/auditoria"
import type { Contexto } from "@/modules/pedidos/pedidos.authorization"
import { dataCivil } from "@/modules/pedidos/pedidos.calculo"
import { PedidoError } from "@/modules/pedidos/pedidos.error"
import * as pedidos from "@/modules/pedidos/pedidos.repository"
import { parcelar } from "./recebiveis.calculo"
import {
  calcularPedido,
  regularizacao,
  validarIntegridade,
} from "./recebiveis.integridade"
import * as repo from "./recebiveis.repository"
import { MAX_PARCELAS, type FecharInput } from "./recebiveis.schema"
import { hash, snapshotPedido } from "./recebiveis.snapshot"

async function confirmarRecebimento(
  tx: pedidos.Transaction,
  pedido: pedidos.Pedido,
) {
  const entregas = await tx.pedido_cliente_entrega.findMany({
    where: { id_pedido_cliente: pedido.id },
    include: { pedido_cliente_entrega_item: true },
  })
  const quantidades = new Map<number, Prisma.Decimal>()
  const itens = new Map(pedido.pedido_cliente_item.map((i) => [i.id, i]))
  let ultima: Date | null = null
  let datasEntregaConhecidas = true
  for (const entrega of entregas) {
    if (entrega.status === "CANCELADA") continue
    if (
      entrega.status !== "RECEBIMENTO_CONFIRMADO" ||
      !entrega.data_confirmacao_recebimento ||
      !entrega.nome_recebedor?.trim() ||
      !entrega.pedido_cliente_entrega_item.length
    )
      throw new PedidoError(
        409,
        "Recebimento completo do pedido ainda não confirmado.",
      )
    for (const item of entrega.pedido_cliente_entrega_item) {
      if (
        item.id_pedido_cliente !== pedido.id ||
        item.id_pedido_cliente_entrega !== entrega.id ||
        !itens.has(item.id_pedido_cliente_item) ||
        item.quantidade.lte(0)
      )
        throw new PedidoError(
          409,
          "Quantidade entregue incompatível com o pedido.",
        )
      quantidades.set(
        item.id_pedido_cliente_item,
        (
          quantidades.get(item.id_pedido_cliente_item) ?? new Prisma.Decimal(0)
        ).plus(item.quantidade),
      )
    }
    // Confirmar o recebimento hoje não prova que a entrega física ocorreu hoje.
    if (!entrega.data_entrega) datasEntregaConhecidas = false
    else if (!ultima || entrega.data_entrega > ultima)
      ultima = entrega.data_entrega
  }
  if (
    !itens.size ||
    pedido.pedido_cliente_item.some(
      (i) => !quantidades.get(i.id)?.eq(i.quantidade),
    )
  )
    throw new PedidoError(
      409,
      "Recebimento completo do pedido ainda não confirmado.",
    )
  return datasEntregaConhecidas ? ultima : null
}

async function prepararPlano(
  tx: pedidos.Transaction,
  ctx: Contexto,
  pedido: pedidos.Pedido,
  input: FecharInput,
) {
  const categoria = await tx.categoria_financeira.findFirst({
    where: { id: input.idCategoriaFinanceira, id_empresa: ctx.idEmpresa },
  })
  if (!categoria) throw new PedidoError(404, "Cadastro não encontrado.")
  if (categoria.status !== "ATIVA" || categoria.tipo === "DESPESA")
    throw new PedidoError(
      409,
      "Categoria deve estar ativa e permitir receitas.",
    )
  let condicaoPagamento = null
  if (pedido.id_condicao_pagamento !== null) {
    const c = await tx.condicoes_pagamento.findFirst({
      where: { id: pedido.id_condicao_pagamento, id_empresa: ctx.idEmpresa },
    })
    if (!c) throw new PedidoError(404, "Cadastro não encontrado.")
    if (
      c.status !== "ATIVA" ||
      c.numero_parcelas < 1 ||
      c.numero_parcelas > MAX_PARCELAS ||
      c.intervalo_dias < 0 ||
      (c.numero_parcelas > 1 && !c.permite_parcelamento) ||
      c.desconto_percentual.lt(0) ||
      c.desconto_percentual.gt(100)
    )
      throw new PedidoError(
        409,
        "Condição de pagamento incompatível; requer revisão.",
      )
    if (c.numero_parcelas !== input.vencimentos.length)
      throw new PedidoError(
        400,
        "Quantidade de vencimentos difere da condição do pedido.",
      )
    if (
      c.intervalo_dias > 0 &&
      input.vencimentos.some(
        (data, index) =>
          index > 0 &&
          dataCivil(data).getTime() -
            dataCivil(input.vencimentos[index - 1]).getTime() !==
            c.intervalo_dias * 86400000,
      )
    )
      throw new PedidoError(
        400,
        "Vencimentos diferem do intervalo da condição do pedido.",
      )
    condicaoPagamento = {
      id: c.id,
      numeroParcelas: c.numero_parcelas,
      intervaloDias: c.intervalo_dias,
      permiteParcelamento: c.permite_parcelamento,
      descontoPercentual: c.desconto_percentual.toFixed(2),
    }
  }
  return {
    idCategoriaFinanceira: categoria.id,
    vencimentos: [...input.vencimentos],
    condicaoPagamento,
  }
}

function confirmacao(
  pedido: pedidos.Pedido,
  fechamento: repo.Fechamento,
  gerado: boolean,
) {
  return {
    idPedido: pedido.id,
    idFechamento: fechamento.id,
    idVenda: fechamento.id_venda,
    versao: pedido.versao,
    fechadoEm: fechamento.data_fechamento.toISOString(),
    gerado,
  }
}

export function fecharPedido(
  ctx: Contexto,
  id: number,
  versao: number,
  input: FecharInput,
) {
  return pedidos.gravacao(async (tx) => {
    // Mesma ordem de locks utilizada na criação/numeração de pedidos.
    await pedidos.bloquearEmpresa(tx, ctx.idEmpresa)
    await repo.bloquearPedido(tx, ctx, id)
    const antes = await pedidos.buscarPedido(tx, ctx, id)
    const existente = await repo.buscarFechamento(tx, ctx, id)
    if (existente) {
      const { plano } = validarIntegridade(antes, existente)
      if (
        plano.idCategoriaFinanceira !== input.idCategoriaFinanceira ||
        hash(plano.vencimentos) !== hash(input.vencimentos)
      )
        throw new PedidoError(
          409,
          "Pedido já fechado com outro plano de pagamento.",
        )
      return confirmacao(antes, existente, false)
    }
    if (
      antes._count.venda > 0 ||
      antes.pedido_cliente_item.some((i) => i._count.item_venda > 0)
    )
      regularizacao()
    if (
      antes.versao !== versao ||
      !["ENTREGUE", "CONCLUIDO"].includes(antes.status)
    )
      throw new PedidoError(
        409,
        "Pedido não está elegível ou foi alterado. Consulte a versão atual.",
      )
    if (antes.versao >= 2147483647)
      throw new PedidoError(409, "Versão do pedido esgotada.")
    const cliente = await tx.clientes.findFirst({
      where: { id: antes.id_cliente, id_empresa: ctx.idEmpresa },
    })
    if (!cliente) throw new PedidoError(404, "Cadastro não encontrado.")
    if (cliente.status !== "ATIVO")
      throw new PedidoError(409, "Cliente não está ativo.")
    const catalogo = await tx.produto_empresa.findMany({
      where: {
        id_empresa: ctx.idEmpresa,
        id_produto: {
          in: [...new Set(antes.pedido_cliente_item.map((i) => i.id_produto))],
        },
      },
      select: { id_produto: true },
    })
    const produtos = new Set(catalogo.map((p) => p.id_produto))
    if (antes.pedido_cliente_item.some((i) => !produtos.has(i.id_produto)))
      throw new PedidoError(404, "Cadastro não encontrado.")
    const valores = calcularPedido(antes)
    const dataEntrega = await confirmarRecebimento(tx, antes)
    const plano = await prepararPlano(tx, ctx, antes, input)
    const parcelas = parcelar(valores.total, plano.vencimentos)
    for (const item of valores.itens) {
      if (
        !antes.pedido_cliente_item
          .find((i) => i.id === item.id)!
          .valor_total.eq(item.valor)
      )
        await tx.pedido_cliente_item.update({
          where: { id: item.id },
          data: { valor_total: item.valor },
        })
    }
    const atualizado = await tx.pedido_cliente.updateMany({
      where: { id, id_empresa: ctx.idEmpresa, versao, status: antes.status },
      data: {
        valor_subtotal: valores.subtotal,
        valor_total: valores.total,
        versao: { increment: 1 },
      },
    })
    if (atualizado.count !== 1)
      throw new PedidoError(409, "Pedido foi alterado por outra operação.")
    const pedido = await pedidos.buscarPedido(tx, ctx, id)
    const numero = await pedidos.proximoNumero(tx, ctx.idEmpresa, "venda")
    const agora = new Date()
    const venda = await tx.venda.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_cliente: pedido.id_cliente,
        id_usuario: ctx.idUsuario,
        id_pedido_cliente: id,
        numero,
        status: "ENTREGUE",
        status_financeiro: "FATURADA",
        data_venda: agora,
        data_entrega: dataEntrega,
        id_condicao_pagamento: pedido.id_condicao_pagamento,
        id_endereco_entrega: pedido.id_endereco_entrega,
        canal_venda: pedido.canal_venda,
        valor_subtotal: pedido.valor_subtotal,
        valor_total: pedido.valor_total,
        valor_desconto: pedido.valor_desconto,
        valor_frete: pedido.valor_frete,
        valor_acrescimo: pedido.valor_acrescimo,
        item_venda: {
          create: pedido.pedido_cliente_item.map((i) => ({
            id_pedido_cliente_item: i.id,
            id_produto: i.id_produto,
            id_cor: i.id_cor,
            id_tamanho: i.id_tamanho,
            quantidade: i.quantidade,
            valor_unitario: i.valor_unitario,
            valor_total: i.valor_total,
          })),
        },
      },
    })
    const snapshot = snapshotPedido(pedido)
    const fechamento = await tx.pedido_cliente_fechamento.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_pedido_cliente: id,
        id_cliente: pedido.id_cliente,
        id_venda: venda.id,
        id_categoria: plano.idCategoriaFinanceira,
        id_usuario: ctx.idUsuario,
        data_fechamento: agora,
        valor_total: valores.total,
        total_parcelas: parcelas.length,
        plano_pagamento: plano,
        hash_plano: hash(plano),
        snapshot_pedido: snapshot,
        hash_pedido: hash(snapshot),
      },
    })
    await tx.contas_receber.createMany({
      data: parcelas.map((p) => ({
        id_empresa: ctx.idEmpresa,
        id_venda: venda.id,
        id_categoria: plano.idCategoriaFinanceira,
        id_fechamento: fechamento.id,
        numero_parcela: p.numeroParcela,
        total_parcelas: p.totalParcelas,
        data_lancamento: agora,
        data_vencimento: dataCivil(p.vencimento),
        valor_original: p.valor,
        valor_final: p.valor,
        saldo: p.valor,
        valor_desconto: 0,
        valor_acrescimo: 0,
        situacao: "ABERTO",
        descricao: `Pedido ${pedido.numero} - parcela ${p.numeroParcela}/${p.totalParcelas}`,
      })),
    })
    const depois = await pedidos.buscarPedido(tx, ctx, id)
    const persistido = await repo.buscarFechamento(tx, ctx, id)
    if (!persistido) regularizacao()
    validarIntegridade(depois, persistido)
    for (const conta of persistido.venda.contas_receber)
      await auditFinancial(tx, ctx, "contas_receber", null, conta, "CRIACAO")
    await pedidos.auditar(tx, ctx, antes, depois)
    await tx.auditoria.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_usuario: ctx.idUsuario,
        tabela: "pedido_cliente_fechamento",
        id_registro: fechamento.id,
        acao: "INSERT",
        dados_novos: JSON.stringify({
          idPedido: id,
          idVenda: venda.id,
          idCategoriaFinanceira: plano.idCategoriaFinanceira,
          fechadoEm: agora.toISOString(),
          total: valores.total.toFixed(2),
          vencimentos: plano.vencimentos,
          totalParcelas: parcelas.length,
          idContasReceber: persistido.venda.contas_receber.map((c) => c.id),
        }),
      },
    })
    return confirmacao(depois, persistido, true)
  }, true)
}

export function consultarContaReceber(ctx: Contexto, id: number) {
  return pedidos.leitura(async (tx) => {
    const pedido = await pedidos.buscarPedido(tx, ctx, id)
    const fechamento = await repo.buscarFechamento(tx, ctx, id)
    if (!fechamento) {
      if (pedido._count.venda > 0) regularizacao()
      throw new PedidoError(
        409,
        "Pedido ainda não possui fechamento financeiro comprovado.",
      )
    }
    const { plano } = validarIntegridade(pedido, fechamento)
    return {
      idPedido: id,
      idFechamento: fechamento.id,
      idVenda: fechamento.id_venda,
      idCliente: fechamento.id_cliente,
      fechadoEm: fechamento.data_fechamento.toISOString(),
      total: fechamento.valor_total.toFixed(2),
      totalParcelas: fechamento.total_parcelas,
      idCategoriaFinanceira: fechamento.id_categoria,
      vencimentos: plano.vencimentos,
      parcelas: fechamento.venda.contas_receber.map((c) => ({
        idContaReceber: c.id,
        numeroParcela: c.numero_parcela,
        totalParcelas: c.total_parcelas,
        vencimento: c.data_vencimento.toISOString().slice(0, 10),
        valorOriginal: c.valor_original.toFixed(2),
        saldo: c.saldo!.toFixed(2),
        situacao: c.situacao,
      })),
    }
  })
}

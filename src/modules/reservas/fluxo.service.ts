import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors"
import { movimentarNaTransacao } from "@/modules/movimentacoes-estoque/movimentacoes-estoque.repository"
import {
  auditar,
  conferir,
  chaveMovimento,
  type Contexto,
  type Tx,
} from "./operacoes"
import { finalizarReserva, restante } from "./reservas.service"
import type { z } from "zod"
import type {
  consumoSchema,
  entregaSchema,
  transferenciaSchema,
} from "./reservas.schema"

export async function consumirMaterial(
  tx: Tx,
  ctx: Contexto,
  idOP: number,
  input: z.infer<typeof consumoSchema>,
  chave: string,
) {
  const op = await tx.ordem_producao.findFirst({
    where: { id: idOP, id_empresa: ctx.idEmpresa },
  })
  if (!op || !["EM_PRODUCAO", "PAUSADA"].includes(op.status))
    throw new ConflictError(
      "Registre consumo real somente com a OP em execução.",
    )
  const reserva = await tx.reserva_estoque.findFirst({
    where: {
      id: input.idReserva,
      id_empresa: ctx.idEmpresa,
      id_ordem_producao: idOP,
      protocolo_integrado: true,
    },
  })
  if (!reserva?.id_necessidade_producao)
    throw new NotFoundError("Reserva de material não encontrada na OP.")
  const q = new Prisma.Decimal(input.quantidade)
  const n = await tx.necessidade_producao.findUniqueOrThrow({
    where: { id: reserva.id_necessidade_producao },
  })
  if (n.consumo_confirmado_em)
    throw new ConflictError("O consumo deste material já foi encerrado.")
  let consumo: Prisma.consumo_producaoGetPayload<object> | null = null
  let idMovimentacao: number | null = null
  if (q.gt(0)) {
    await finalizarReserva(
      tx,
      ctx,
      reserva.id,
      q,
      true,
      "Consumo real informado na OP",
    )
    const movimento = await movimentarNaTransacao(
      tx,
      ctx,
      {
        idProduto: reserva.id_produto,
        idLocalEstoque: reserva.id_local_estoque!,
        idSetor: reserva.id_setor!,
        idVariacao: reserva.id_variacao ?? undefined,
        quantidade: q.toFixed(3),
        observacao: `Consumo real OP ${idOP}`,
      },
      "saida",
      {
        tipo: "SAIDA_PRODUCAO",
        nome: "CONSUMO_PRODUCAO",
        id: idOP,
        chave: chaveMovimento("consumo", chave),
      },
    )
    consumo = await tx.consumo_producao.create({
      data: {
        id_ordem_producao: idOP,
        id_necessidade_producao: n.id,
        id_reserva_estoque: reserva.id,
        id_produto: reserva.id_produto,
        id_setor: reserva.id_setor!,
        id_usuario: ctx.idUsuario,
        quantidade: q,
        data_consumo: new Date(),
        id_movimentacao_estoque: movimento.idMovimentacao,
      },
    })
    idMovimentacao = movimento.idMovimentacao
  }
  if (input.concluirConsumo) {
    if (
      !n.quantidade_consumida.plus(q).eq(n.quantidade_necessaria) &&
      !input.motivoDivergencia
    )
      throw new ValidationError(
        "Informe o motivo da diferença entre consumo real e planejado.",
      )
    const sobras = await tx.reserva_estoque.findMany({
      where: {
        id_empresa: ctx.idEmpresa,
        id_necessidade_producao: n.id,
        status: "ATIVA",
        protocolo_integrado: true,
      },
      orderBy: { id: "asc" },
    })
    for (const sobra of sobras)
      await finalizarReserva(
        tx,
        ctx,
        sobra.id,
        restante(sobra),
        false,
        input.motivoDivergencia ?? "Consumo concluído; material não utilizado",
      )
    await tx.necessidade_producao.update({
      where: { id: n.id },
      data: { status: "CONSUMIDA", consumo_confirmado_em: new Date() },
    })
  }
  if (consumo)
    await auditar(tx, ctx, "consumo_producao", consumo.id, null, {
      ...consumo,
      planejado: n.quantidade_necessaria.toFixed(3),
      consumoEncerrado: input.concluirConsumo,
      motivoDivergencia: input.motivoDivergencia,
    })
  if (!consumo)
    await auditar(tx, ctx, "necessidade_producao", n.id, n, {
      consumoEncerrado: true,
      quantidadeConsumida: n.quantidade_consumida.toFixed(3),
      motivoDivergencia: input.motivoDivergencia,
      novaBaixa: false,
    })
  return {
    idConsumo: consumo?.id ?? null,
    idMovimentacao,
    quantidade: q.toFixed(3),
    consumoEncerrado: input.concluirConsumo,
  }
}

/** Invocado dentro da transação da conclusão, nunca pelo GET ou fechamento. */
export async function entradaConclusao(tx: Tx, ctx: Contexto, idOP: number) {
  await conferir(tx, ctx, [
    ["ESTOQUE", "editar"],
    ["ORDENS_PRODUCAO", "editar"],
  ])
  const op = await tx.ordem_producao.findFirst({
    where: { id: idOP, id_empresa: ctx.idEmpresa },
    include: {
      ordem_producao_item: true,
      ordem_producao_consumo_planejado: true,
      necessidade_producao: {
        include: {
          consumo_producao: { include: { movimentacao_estoque: true } },
        },
      },
    },
  })
  if (!op?.id_local_estoque || !op.id_setor)
    throw new ConflictError(
      "Defina na OP o local físico de produtos prontos da fábrica e conclua o fluxo de setores.",
    )
  const materiais = [
    ...new Set(
      op.ordem_producao_consumo_planejado.map((p) => p.id_materia_prima),
    ),
  ]
  for (const produto of materiais) {
    const n = op.necessidade_producao.find((n) => n.id_produto === produto)
    if (
      !n?.consumo_confirmado_em ||
      n.status !== "CONSUMIDA" ||
      n.quantidade_reservada.gt(0) ||
      (n.quantidade_consumida.gt(0) && !n.consumo_producao.length)
    )
      throw new ConflictError(
        "Há material sem consumo real confirmado. A ficha planejada não comprova baixa.",
      )
    const soma = n.consumo_producao.reduce(
      (s, c) => s.plus(c.quantidade),
      new Prisma.Decimal(0),
    )
    if (
      !soma.eq(n.quantidade_consumida) ||
      n.consumo_producao.some(
        (c) =>
          !c.movimentacao_estoque ||
          c.movimentacao_estoque.id_empresa !== ctx.idEmpresa ||
          c.movimentacao_estoque.id_produto !== produto ||
          c.movimentacao_estoque.tipo !== "SAIDA_PRODUCAO" ||
          !c.movimentacao_estoque.quantidade.eq(c.quantidade),
      )
    )
      throw new ConflictError(
        "Consumo sem movimentação correspondente exige regularização.",
      )
  }
  const movimentos = []
  for (const item of op.ordem_producao_item.sort(
    (a, b) => a.id_produto - b.id_produto || a.id - b.id,
  )) {
    if (!item.quantidade_produzida.gt(0))
      throw new ConflictError(
        "Informe a produção efetiva de cada item antes de concluir.",
      )
    const variacoes = await tx.produto_variacoes.findMany({
      where: {
        id_empresa: ctx.idEmpresa,
        id_produto: item.id_produto,
        id_cor: item.id_cor,
        id_tamanho: item.id_tamanho,
        status: "ATIVO",
      },
    })
    const possuiGrade = await tx.produto_variacoes.count({
      where: { id_empresa: ctx.idEmpresa, id_produto: item.id_produto },
    })
    if (
      (possuiGrade && variacoes.length !== 1) ||
      (!possuiGrade && (item.id_cor || item.id_tamanho))
    )
      throw new ConflictError(
        "A cor e o tamanho produzidos precisam identificar uma variação válida, sem inferir outra grade.",
      )
    const chave = `op:${idOP}:item:${item.id}`
    if (
      await tx.movimentacao_estoque.findUnique({
        where: {
          id_empresa_chave_operacao: {
            id_empresa: ctx.idEmpresa,
            chave_operacao: chave,
          },
        },
      })
    )
      throw new ConflictError(
        "Este item já possui entrada de produção. Regularize o estado da OP antes de concluir novamente.",
      )
    const mov = await movimentarNaTransacao(
      tx,
      ctx,
      {
        idProduto: item.id_produto,
        idLocalEstoque: op.id_local_estoque,
        idSetor: op.id_setor,
        idVariacao: variacoes[0]?.id,
        quantidade: item.quantidade_produzida.toFixed(3),
        observacao: `Produtos prontos da fábrica, OP ${idOP}; chegada à loja exige transferência recebida`,
      },
      "entrada",
      { tipo: "ENTRADA_PRODUCAO", nome: "ORDEM_PRODUCAO", id: idOP, chave },
    )
    movimentos.push(mov.idMovimentacao)
  }
  return movimentos
}

export async function confirmarEntrega(
  tx: Tx,
  ctx: Contexto,
  idPedido: number,
  input: z.infer<typeof entregaSchema>,
  chave: string,
) {
  const pedido = await tx.pedido_cliente.findFirst({
    where: { id: idPedido, id_empresa: ctx.idEmpresa },
    include: {
      pedido_cliente_item: {
        include: {
          pedido_cliente_entrega_item: {
            include: { pedido_cliente_entrega: true },
          },
        },
      },
      pedido_cliente_entrega: true,
      pedido_cliente_fechamento: true,
    },
  })
  if (!pedido) throw new NotFoundError("Pedido não encontrado na empresa.")
  if (
    ![
      "CONFIRMADO",
      "EM_PRODUCAO",
      "PRONTO",
      "EM_ENTREGA",
      "PARCIALMENTE_ENTREGUE",
    ].includes(pedido.status) ||
    pedido.pedido_cliente_fechamento.length
  )
    throw new ConflictError("O pedido não permite nova entrega.")
  if (new Set(input.itens.map((i) => i.idReserva)).size !== input.itens.length)
    throw new ValidationError(
      "Informe cada reserva somente uma vez por entrega.",
    )
  const agora = new Date()
  const entrega = await tx.pedido_cliente_entrega.create({
    data: {
      id_pedido_cliente: idPedido,
      id_usuario: ctx.idUsuario,
      numero_entrega:
        Math.max(
          0,
          ...pedido.pedido_cliente_entrega.map((e) => e.numero_entrega),
        ) + 1,
      status: "RECEBIMENTO_CONFIRMADO",
      nome_recebedor: input.nomeRecebedor,
      data_entrega: agora,
      data_confirmacao_recebimento: agora,
    },
  })
  const quantidades = new Map<number, Prisma.Decimal>()
  for (const linha of input.itens) {
    const item = pedido.pedido_cliente_item.find((i) => i.id === linha.idItem)
    const reserva = await tx.reserva_estoque.findFirst({
      where: {
        id: linha.idReserva,
        id_empresa: ctx.idEmpresa,
        id_pedido_cliente_item: linha.idItem,
        protocolo_integrado: true,
      },
    })
    if (
      !item ||
      !reserva ||
      reserva.id_produto !== item.id_produto ||
      reserva.id_variacao !== item.id_variacao
    )
      throw new NotFoundError(
        "Reserva não corresponde ao item e à variação do pedido.",
      )
    const entregue = item.pedido_cliente_entrega_item
      .filter(
        (e) =>
          !["CANCELADA", "PREPARANDO", "NAO_ENTREGUE"].includes(
            e.pedido_cliente_entrega.status,
          ),
      )
      .reduce((s, e) => s.plus(e.quantidade), new Prisma.Decimal(0))
    const q = new Prisma.Decimal(linha.quantidade)
    if (
      q.gt(item.quantidade.minus(entregue).minus(quantidades.get(item.id) ?? 0))
    )
      throw new ConflictError("Entrega acima da quantidade ainda pendente.")
    await finalizarReserva(
      tx,
      ctx,
      reserva.id,
      q,
      true,
      `Entrega ${entrega.id} confirmada pelo recebedor`,
    )
    await movimentarNaTransacao(
      tx,
      ctx,
      {
        idProduto: item.id_produto,
        idVariacao: item.id_variacao ?? undefined,
        idLocalEstoque: reserva.id_local_estoque!,
        idSetor: reserva.id_setor!,
        quantidade: q.toFixed(3),
        observacao: `Entrega ${entrega.id} do pedido ${idPedido}`,
      },
      "saida",
      {
        tipo: "SAIDA_VENDA",
        nome: "PEDIDO_ENTREGA",
        id: entrega.id,
        chave: `entrega:${entrega.id}:item:${item.id}:reserva:${reserva.id}`,
      },
    )
    quantidades.set(
      item.id,
      (quantidades.get(item.id) ?? new Prisma.Decimal(0)).plus(q),
    )
  }
  await tx.pedido_cliente_entrega_item.createMany({
    data: [...quantidades].map(([idItem, q]) => ({
      id_pedido_cliente: idPedido,
      id_pedido_cliente_entrega: entrega.id,
      id_pedido_cliente_item: idItem,
      quantidade: q,
    })),
  })
  const itens = await tx.pedido_cliente_item.findMany({
    where: { id_pedido_cliente: idPedido },
    include: {
      pedido_cliente_entrega_item: {
        where: { pedido_cliente_entrega: { status: "RECEBIMENTO_CONFIRMADO" } },
      },
    },
  })
  const completo = itens.every((item) =>
    item.pedido_cliente_entrega_item
      .reduce((s, e) => s.plus(e.quantidade), new Prisma.Decimal(0))
      .eq(item.quantidade),
  )
  const depois = await tx.pedido_cliente.update({
    where: { id: idPedido },
    data: {
      status: completo ? "ENTREGUE" : "PARCIALMENTE_ENTREGUE",
      versao: { increment: 1 },
    },
  })
  await auditar(tx, ctx, "pedido_cliente_entrega", entrega.id, null, {
    ...entrega,
    chaveConfirmacao: chave,
  })
  await auditar(
    tx,
    ctx,
    "pedido_cliente",
    idPedido,
    { id: pedido.id, status: pedido.status, versao: pedido.versao },
    {
      idPedido,
      status: depois.status,
      versao: depois.versao,
      idEntrega: entrega.id,
    },
  )
  return {
    idEntrega: entrega.id,
    idPedido,
    status: depois.status,
    versao: depois.versao,
  }
}

export async function enviarTransferencia(
  tx: Tx,
  ctx: Contexto,
  input: z.infer<typeof transferenciaSchema>,
  chave: string,
) {
  if (input.idLocalOrigem === input.idLocalDestino)
    throw new ValidationError("Origem e destino devem ser locais diferentes.")
  const destino = await tx.locais_estoque.findFirst({
    where: {
      id: input.idLocalDestino,
      id_empresa: ctx.idEmpresa,
      status: "ATIVO",
    },
  })
  const setor = await tx.setores.findFirst({
    where: {
      id: input.idSetorDestino,
      id_empresa: ctx.idEmpresa,
      status: "ATIVO",
    },
  })
  if (!destino || !setor)
    throw new NotFoundError(
      "Local e setor de destino ativos não encontrados na empresa.",
    )
  const mov = await movimentarNaTransacao(
    tx,
    ctx,
    {
      idProduto: input.idProduto,
      idVariacao: input.idVariacao,
      idLocalEstoque: input.idLocalOrigem,
      idSetor: input.idSetorOrigem,
      quantidade: input.quantidade,
      observacao: input.observacao,
    },
    "saida",
    {
      tipo: "TRANSFERENCIA_SAIDA",
      nome: "TRANSFERENCIA_ENVIO",
      id: input.idLocalDestino,
      chave: chaveMovimento("transferir", chave),
    },
  )
  const transferencia = await tx.transferencia_estoque.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      id_produto: input.idProduto,
      id_variacao: input.idVariacao,
      id_local_origem: input.idLocalOrigem,
      id_setor_origem: input.idSetorOrigem,
      id_local_destino: input.idLocalDestino,
      id_setor_destino: input.idSetorDestino,
      quantidade: input.quantidade,
      id_movimento_saida: mov.idMovimentacao,
    },
  })
  await tx.movimentacao_estoque.update({
    where: { id: mov.idMovimentacao },
    data: { origem_id: transferencia.id },
  })
  await auditar(
    tx,
    ctx,
    "transferencia_estoque",
    transferencia.id,
    null,
    transferencia,
  )
  return {
    idTransferencia: transferencia.id,
    status: transferencia.status,
    idMovimentoSaida: mov.idMovimentacao,
  }
}
export async function receberTransferencia(tx: Tx, ctx: Contexto, id: number) {
  const row = await tx.transferencia_estoque.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
  })
  if (!row) throw new NotFoundError("Transferência não encontrada na empresa.")
  if (row.status === "RECEBIDA")
    return {
      idTransferencia: id,
      status: row.status,
      idMovimentoEntrada: row.id_movimento_entrada,
    }
  const mov = await movimentarNaTransacao(
    tx,
    ctx,
    {
      idProduto: row.id_produto,
      idVariacao: row.id_variacao ?? undefined,
      idLocalEstoque: row.id_local_destino,
      idSetor: row.id_setor_destino,
      quantidade: row.quantidade.toFixed(3),
      observacao: `Recebimento físico da transferência ${id}`,
    },
    "entrada",
    {
      tipo: "TRANSFERENCIA_ENTRADA",
      nome: "TRANSFERENCIA_RECEBIMENTO",
      id,
      chave: `transferencia:${id}:receber`,
    },
  )
  const depois = await tx.transferencia_estoque.update({
    where: { id },
    data: {
      status: "RECEBIDA",
      data_recebimento: new Date(),
      id_movimento_entrada: mov.idMovimentacao,
    },
  })
  await auditar(tx, ctx, "transferencia_estoque", id, row, depois)
  return {
    idTransferencia: id,
    status: depois.status,
    idMovimentoEntrada: mov.idMovimentacao,
  }
}

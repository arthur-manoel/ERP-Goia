import { auditar } from "./cancelamentos.auditoria"
import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors"
import { type Contexto, type Tx } from "@/modules/reservas/operacoes"
import { finalizarReserva, restante } from "@/modules/reservas/reservas.service"
import { recebidoValido } from "@/modules/recebimentos/recebimentos.service"
import { calcularCobranca } from "@/modules/recebimentos/recebimentos.saldo"
import { movimentarNaTransacao } from "@/modules/movimentacoes-estoque/movimentacoes-estoque.repository"
import { evento } from "@/modules/notificacoes/notificacoes.service"
import { acesso, exigir } from "./cancelamentos.authorization"
import { preparar, type Plano } from "./cancelamentos.plano"
import type { z } from "zod"
import type * as schemas from "./cancelamentos.schema"
const zero = () => new Prisma.Decimal(0)
export async function buscar(tx: Tx, ctx: Contexto, id: number) {
  const row = await tx.pedido_cancelamento.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
  })
  if (!row)
    throw new NotFoundError("Solicitação não encontrada na empresa ativa.")
  return row
}
export async function pendencias(tx: Tx, ctx: Contexto, id: number) {
  const linhas = await tx.pedido_devolucao_linha.findMany({
    where: {
      id_empresa: ctx.idEmpresa,
      pedido_entrega_estorno: { id_cancelamento: id },
    },
    include: {
      pedido_devolucao_recebimento: {
        include: { pedido_devolucao_destinacao: true },
      },
    },
  })
  const devolucao = linhas.some(
    (l) =>
      !l.pedido_devolucao_recebimento
        .reduce((s, r) => s.plus(r.quantidade), zero())
        .eq(l.quantidade_prevista) ||
      l.pedido_devolucao_recebimento.some(
        (r) =>
          !r.pedido_devolucao_destinacao
            .reduce((s, d) => s.plus(d.quantidade), zero())
            .eq(r.quantidade),
      ),
  )
  const creditos = await tx.pedido_credito_receber.findMany({
    where: { id_empresa: ctx.idEmpresa, id_cancelamento: id },
    include: { pedido_reembolso: true },
  })
  const financeiro = creditos.some(
    (c) =>
      !c.pedido_reembolso
        .reduce((s, r) => s.plus(r.valor), zero())
        .eq(c.valor_restituir),
  )
  return { devolucao, financeiro }
}
export async function atualizarConclusao(tx: Tx, ctx: Contexto, id: number) {
  const p = await pendencias(tx, ctx, id)
  const antes = await buscar(tx, ctx, id)
  if (!antes.executado_em) return p
  const status =
    p.devolucao || p.financeiro ? "EXECUTADA_PENDENCIAS" : "CONCLUIDA"
  if (status !== antes.status || antes.ultima_falha) {
    const depois = await tx.pedido_cancelamento.update({
      where: { id },
      data: {
        status,
        concluido_em: status === "CONCLUIDA" ? new Date() : null,
        ultima_falha: null,
      },
    })
    await auditar(tx, ctx, "pedido_cancelamento", id, antes, depois)
  }
  if (p.devolucao)
    await evento(
      tx,
      ctx,
      id,
      "DEVOLUCAO_PENDENTE",
      "ESTOQUE",
      "Devolução física pendente",
      `Cancelamento ${id}: confirme os itens efetivamente recebidos e suas destinações.`,
    )
  if (p.financeiro)
    await evento(
      tx,
      ctx,
      id,
      "REEMBOLSO_PENDENTE",
      "FINANCEIRO",
      "Restituição pendente",
      `Cancelamento ${id}: existe obrigação financeira a acompanhar.`,
    )
  if (status === "CONCLUIDA")
    await evento(
      tx,
      ctx,
      id,
      "CONCLUSAO",
      "TODOS",
      "Cancelamento concluído",
      `Cancelamento ${id}: as etapas internas foram concluídas. O processo fiscal externo deve ser conferido pelo responsável.`,
    )
  return p
}
async function ajustarFinanceiro(tx: Tx, ctx: Contexto, id: number, p: Plano) {
  if (!p.credito.gt(0)) return
  exigir(
    (await acesso(tx, ctx)).cancelarFinanceiro,
    "A execução exige leitura, edição e exclusão no financeiro.",
  )
  if (!p.fechamento)
    throw new ConflictError("Fechamento financeiro não comprovado.")
  let falta = p.credito
  const planos = []
  for (const c of p.fechamento.venda.contas_receber) {
    const saldo = await recebidoValido(tx, c)
    planos.push({ c, saldo, anular: zero(), restituir: zero() })
  }
  // Compensa primeiro cobranças em aberto; somente o excedente vira restituição.
  for (const plano of planos) {
    plano.anular = Prisma.Decimal.min(falta, plano.saldo.saldo)
    falta = falta.minus(plano.anular)
  }
  for (const plano of planos) {
    plano.restituir = Prisma.Decimal.min(
      falta,
      plano.saldo.exigivel.minus(plano.saldo.saldo),
    )
    falta = falta.minus(plano.restituir)
  }
  if (!falta.isZero())
    throw new ConflictError(
      "Crédito não pôde ser conciliado com as parcelas originais.",
    )
  for (const { c, saldo, anular, restituir } of planos) {
    const valor = anular.plus(restituir)
    if (valor.isZero()) continue
    const credito = await tx.pedido_credito_receber.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_cancelamento: id,
        id_conta_receber: c.id,
        id_usuario: ctx.idUsuario,
        valor,
        saldo_anulado: anular,
        valor_restituir: restituir,
        saldo_anterior: saldo.saldo,
        situacao_anterior: c.situacao,
      },
    })
    const cobranca = calcularCobranca(c.valor_final, saldo.valor, [
      ...(p.creditos.get(c.id) ?? []),
      credito,
    ])
    const depois = await tx.contas_receber.update({
      where: { id: c.id },
      data: {
        saldo: cobranca.saldo,
        situacao: cobranca.situacao,
        data_atualizacao: new Date(),
      },
    })
    await auditar(tx, ctx, "pedido_credito_receber", credito.id, null, credito)
    await auditar(tx, ctx, "contas_receber", c.id, c, {
      ...depois,
      evento: "COMPENSACAO_CANCELAMENTO",
      idCancelamento: id,
      idCredito: credito.id,
    })
  }
}
export class ReavaliacaoNecessaria extends ConflictError {}

export async function executarEstorno(tx: Tx, ctx: Contexto, id: number) {
  const row = await buscar(tx, ctx, id)
  const a = await acesso(tx, ctx)
  exigir(a.solicitar)
  if (row.status !== "AGUARDANDO_EXECUCAO" || row.executado_em)
    throw new ConflictError(
      "A solicitação não está aprovada e disponível para execução.",
    )
  if (row.exige_aprovacao && (row.decisao !== "APROVADA" || !row.id_decisor))
    throw new ConflictError("Aprovação gerencial necessária.")
  if (row.exige_aprovacao) {
    const decisor = await acesso(tx, { ...ctx, idUsuario: row.id_decisor! })
    exigir(
      decisor.gerente,
      "A autorização gerencial não está mais ativa; reavalie a solicitação.",
    )
  }
  const p = await preparar(tx, ctx, row.id_pedido_cliente, {
    tipo: row.tipo as schemas.Escopo["tipo"],
    ...(row.id_entrega ? { idEntrega: row.id_entrega } : {}),
  })
  if (p.hashEstado !== row.hash_estado)
    throw new ReavaliacaoNecessaria(
      "O pedido, estoque ou financeiro mudou. Reavalie a solicitação e obtenha nova aprovação quando exigida.",
    )
  if (p.efeitos.inconsistencias.length)
    throw new ReavaliacaoNecessaria(
      "Há inconsistências históricas. Regularize a origem e reavalie antes de executar.",
    )
  if (
    p.reservas.length ||
    p.movimentos.some((m) => p.selecionadas.some((e) => e.id === m.origem_id))
  )
    exigir(
      a.editarEstoque,
      "A execução com efeitos de estoque exige permissão de edição no estoque.",
    )
  for (const r of p.reservas)
    await finalizarReserva(
      tx,
      ctx,
      r.id,
      restante(r),
      false,
      `Cancelamento ${id}: ${row.motivo}`.slice(0, 255),
    )
  for (const e of p.selecionadas) {
    const estorno = await tx.pedido_entrega_estorno.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_pedido_cliente: row.id_pedido_cliente,
        id_cancelamento: id,
        id_entrega: e.id,
        id_usuario: ctx.idUsuario,
        status_anterior: e.status,
        valor_creditado: row.tipo === "ENTREGA" ? p.credito : 0,
        rateio_itens: p.rateio.filter((l) =>
          e.pedido_cliente_entrega_item.some(
            (i) => i.id_pedido_cliente_item === l.idItem,
          ),
        ),
      },
    })
    for (const m of p.movimentos.filter((m) => m.origem_id === e.id))
      await tx.pedido_devolucao_linha.create({
        data: {
          id_empresa: ctx.idEmpresa,
          id_entrega_estorno: estorno.id,
          id_movimento_saida: m.id,
          quantidade_prevista: m.quantidade,
        },
      })
    await tx.pedido_cliente_entrega.update({
      where: { id: e.id },
      data: { status: "CANCELADA" },
    })
    await auditar(tx, ctx, "pedido_entrega_estorno", estorno.id, null, estorno)
    await auditar(tx, ctx, "pedido_cliente_entrega", e.id, e, {
      status: "CANCELADA",
      idEstorno: estorno.id,
      devolucaoFisica: "PENDENTE_DE_RECEBIMENTO",
    })
  }
  await ajustarFinanceiro(tx, ctx, id, p)
  if (
    row.tipo !== "ENTREGA" &&
    p.fechamento &&
    !(await tx.pedido_fechamento_estorno.findUnique({
      where: { id_fechamento: p.fechamento.id },
    }))
  ) {
    const marker = await tx.pedido_fechamento_estorno.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_pedido_cliente: row.id_pedido_cliente,
        id_cancelamento: id,
        id_fechamento: p.fechamento.id,
        id_usuario: ctx.idUsuario,
      },
    })
    await auditar(tx, ctx, "pedido_fechamento_estorno", marker.id, null, marker)
  }
  if (p.pedido.versao >= 2147483647)
    throw new ConflictError("Versão do pedido esgotada.")
  const status =
    row.tipo === "PEDIDO"
      ? "CANCELADO"
      : row.tipo === "ENTREGA"
        ? "PARCIALMENTE_ENTREGUE"
        : p.pedido.status
  const depois = await tx.pedido_cliente.update({
    where: { id: row.id_pedido_cliente, id_empresa: ctx.idEmpresa },
    data: {
      status,
      versao: { increment: 1 },
      ...(row.tipo === "PEDIDO"
        ? { data_cancelamento: new Date(), motivo_cancelamento: row.motivo }
        : {}),
    },
  })
  await tx.pedido_cliente_historico.create({
    data: {
      id_pedido_cliente: row.id_pedido_cliente,
      id_usuario: ctx.idUsuario,
      status_anterior: p.pedido.status,
      status_novo: status,
      observacao: `${row.tipo}: solicitação ${id}. ${row.motivo}`,
    },
  })
  await auditar(tx, ctx, "pedido_cliente", row.id_pedido_cliente, p.pedido, {
    ...depois,
    idCancelamento: id,
    producoesComprasConsumos: "PRESERVADOS",
  })
  const executada = await tx.pedido_cancelamento.update({
    where: { id },
    data: {
      status: "EXECUTADA_PENDENCIAS",
      executado_em: new Date(),
      ultima_falha: null,
    },
  })
  await auditar(tx, ctx, "pedido_cancelamento", id, row, executada)
  const pendente = await atualizarConclusao(tx, ctx, id)
  return {
    id,
    status:
      pendente.devolucao || pendente.financeiro
        ? "EXECUTADA_PENDENCIAS"
        : "CONCLUIDA",
    ...pendente,
  }
}
async function destinar(
  tx: Tx,
  ctx: Contexto,
  id: number,
  recebimento: Prisma.pedido_devolucao_recebimentoGetPayload<object>,
  movimento: Prisma.movimentacao_estoqueGetPayload<object>,
  input: z.infer<typeof schemas.destinacaoSchema>,
) {
  const quantidade = new Prisma.Decimal(input.quantidade)
  const anteriores = await tx.pedido_devolucao_destinacao.aggregate({
    where: { id_recebimento: recebimento.id, id_empresa: ctx.idEmpresa },
    _sum: { quantidade: true },
  })
  if (
    quantidade.gt(recebimento.quantidade.minus(anteriores._sum.quantidade ?? 0))
  )
    throw new ConflictError(
      "Quantidade superior à devolução ainda sem destino.",
    )
  const dados = {
    idProduto: movimento.id_produto,
    idVariacao: movimento.id_variacao ?? undefined,
    idLocalEstoque: input.idLocalEstoque,
    idSetor: input.idSetor,
    quantidade: quantidade.toFixed(3),
    observacao:
      `Devolução ${recebimento.id}, cancelamento ${id}: ${input.motivo}`.slice(
        0,
        255,
      ),
  }
  const numero = await tx.pedido_devolucao_destinacao.count({
    where: { id_recebimento: recebimento.id },
  })
  const prefixo = `devolucao:${recebimento.id}:destino:${numero + 1}`
  const entrada = await movimentarNaTransacao(tx, ctx, dados, "entrada", {
    tipo: "AJUSTE_ENTRADA",
    nome: "DEVOLUCAO_PEDIDO",
    id: recebimento.id,
    chave: `${prefixo}:entrada`,
  })
  const saida =
    input.tratamento === "DESCARTE"
      ? await movimentarNaTransacao(tx, ctx, dados, "saida", {
          tipo: "AJUSTE_SAIDA",
          nome: "DESCARTE_DEVOLUCAO",
          id: recebimento.id,
          chave: `${prefixo}:saida`,
        })
      : null
  const registro = await tx.pedido_devolucao_destinacao.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_recebimento: recebimento.id,
      id_usuario: ctx.idUsuario,
      quantidade,
      tratamento: input.tratamento,
      motivo: input.motivo,
      id_movimento_entrada: entrada.idMovimentacao,
      id_movimento_saida: saida?.idMovimentacao,
    },
  })
  await auditar(tx, ctx, "pedido_devolucao_destinacao", registro.id, null, {
    ...registro,
    idCancelamento: id,
    idMovimentoOriginal: movimento.id,
  })
  return registro
}
export async function receberDevolucao(
  tx: Tx,
  ctx: Contexto,
  id: number,
  input: z.infer<typeof schemas.devolucaoSchema>,
) {
  exigir((await acesso(tx, ctx)).editarEstoque)
  const row = await buscar(tx, ctx, id)
  if (!row.executado_em || row.status !== "EXECUTADA_PENDENCIAS")
    throw new ConflictError("Execute o estorno antes de receber a devolução.")
  const linha = await tx.pedido_devolucao_linha.findFirst({
    where: {
      id: input.idLinha,
      id_empresa: ctx.idEmpresa,
      pedido_entrega_estorno: { id_cancelamento: id },
    },
    include: { movimentacao_estoque: true, pedido_devolucao_recebimento: true },
  })
  if (!linha)
    throw new NotFoundError(
      "Item de devolução não encontrado nesta solicitação.",
    )
  const recebido = linha.pedido_devolucao_recebimento.reduce(
    (s, r) => s.plus(r.quantidade),
    zero(),
  )
  const q = new Prisma.Decimal(input.quantidade)
  if (q.gt(linha.quantidade_prevista.minus(recebido)))
    throw new ConflictError("Quantidade superior ao retorno ainda pendente.")
  const registro = await tx.pedido_devolucao_recebimento.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_linha: linha.id,
      id_usuario: ctx.idUsuario,
      quantidade: q,
      condicao: input.condicao,
      observacao: input.observacao,
    },
  })
  await auditar(
    tx,
    ctx,
    "pedido_devolucao_recebimento",
    registro.id,
    null,
    registro,
  )
  if (input.condicao === "APROVEITAVEL")
    await destinar(tx, ctx, id, registro, linha.movimentacao_estoque, {
      idRecebimento: registro.id,
      quantidade: input.quantidade,
      tratamento: "ESTOQUE",
      motivo: input.observacao,
      idLocalEstoque: input.idLocalEstoque!,
      idSetor: input.idSetor!,
    })
  return {
    idRecebimento: registro.id,
    ...(await atualizarConclusao(tx, ctx, id)),
  }
}
export async function destinarAvaria(
  tx: Tx,
  ctx: Contexto,
  id: number,
  input: z.infer<typeof schemas.destinacaoSchema>,
) {
  const a = await acesso(tx, ctx)
  exigir(
    a.editarEstoque && a.gerente,
    "A destinação de avaria exige estoque e autorização gerencial ativa.",
  )
  const row = await buscar(tx, ctx, id)
  if (!row.executado_em || row.status !== "EXECUTADA_PENDENCIAS")
    throw new ConflictError("Não há estorno com pendências em execução.")
  const r = await tx.pedido_devolucao_recebimento.findFirst({
    where: {
      id: input.idRecebimento,
      id_empresa: ctx.idEmpresa,
      condicao: "AVARIADA",
      pedido_devolucao_linha: {
        pedido_entrega_estorno: { id_cancelamento: id },
      },
    },
    include: {
      pedido_devolucao_linha: { include: { movimentacao_estoque: true } },
    },
  })
  if (!r)
    throw new NotFoundError(
      "Recebimento avariado não encontrado nesta solicitação.",
    )
  const destino = await destinar(
    tx,
    ctx,
    id,
    r,
    r.pedido_devolucao_linha.movimentacao_estoque,
    input,
  )
  return {
    idDestinacao: destino.id,
    ...(await atualizarConclusao(tx, ctx, id)),
  }
}
const civil = (data: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data)
export async function reembolsar(
  tx: Tx,
  ctx: Contexto,
  id: number,
  input: z.infer<typeof schemas.reembolsoSchema>,
) {
  exigir((await acesso(tx, ctx)).editarFinanceiro)
  const row = await buscar(tx, ctx, id)
  if (!row.executado_em || row.status !== "EXECUTADA_PENDENCIAS")
    throw new ConflictError("Não há restituição pendente nesta solicitação.")
  const credito = await tx.pedido_credito_receber.findFirst({
    where: {
      id: input.idCredito,
      id_empresa: ctx.idEmpresa,
      id_cancelamento: id,
    },
    include: {
      pedido_reembolso: { include: { movimentacoes_financeiras: true } },
    },
  })
  if (!credito)
    throw new NotFoundError(
      "Obrigação financeira não encontrada nesta solicitação.",
    )
  for (const r of credito.pedido_reembolso) {
    const m = r.movimentacoes_financeiras
    if (
      m.length !== 1 ||
      m[0].id_empresa !== ctx.idEmpresa ||
      m[0].tipo !== "SAIDA" ||
      m[0].origem !== "AJUSTE" ||
      m[0].id_conta_bancaria !== r.id_conta_bancaria ||
      !m[0].valor.eq(r.valor)
    )
      throw new ConflictError(
        "Reembolso anterior sem extrato íntegro. Regularização necessária.",
      )
  }
  const pago = credito.pedido_reembolso.reduce(
    (s, r) => s.plus(r.valor),
    zero(),
  )
  const valor = new Prisma.Decimal(input.valor)
  if (valor.gt(credito.valor_restituir.minus(pago)))
    throw new ConflictError("Valor superior à restituição pendente.")
  if (
    input.data < civil(credito.data_credito) ||
    input.data > civil(new Date())
  )
    throw new ValidationError(
      "A data deve estar entre a constituição da restituição e hoje.",
    )
  const banco = await tx.contas_bancarias.findFirst({
    where: {
      id: input.idContaBancaria,
      id_empresa: ctx.idEmpresa,
      status: "ATIVA",
    },
  })
  if (!banco)
    throw new NotFoundError("Conta financeira ativa não encontrada na empresa.")
  const reembolso = await tx.pedido_reembolso.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_credito: credito.id,
      id_conta_bancaria: banco.id,
      id_usuario: ctx.idUsuario,
      valor,
      data_pagamento: new Date(`${input.data}T12:00:00.000Z`),
      referencia: input.referencia,
      observacao: input.observacao,
    },
  })
  const movimento = await tx.movimentacoes_financeiras.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_pedido_reembolso: reembolso.id,
      id_conta_bancaria: banco.id,
      tipo: "SAIDA",
      origem: "AJUSTE",
      valor,
      data_movimentacao: reembolso.data_pagamento,
      descricao: `Restituição do cancelamento ${id}, crédito ${credito.id}`,
      observacao: input.observacao,
    },
  })
  await auditar(tx, ctx, "pedido_reembolso", reembolso.id, null, reembolso)
  await auditar(
    tx,
    ctx,
    "movimentacoes_financeiras",
    movimento.id,
    null,
    movimento,
  )
  return {
    idReembolso: reembolso.id,
    idMovimento: movimento.id,
    ...(await atualizarConclusao(tx, ctx, id)),
  }
}

import { auditar } from "./cancelamentos.auditoria"
import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { ConflictError } from "@/lib/api/errors"
import {
  chaveMovimento,
  type Contexto,
  type Tx,
} from "@/modules/reservas/operacoes"
import { acesso, exigir, podeConsultar } from "./cancelamentos.authorization"
import { preparar, mostrarPrevia, projetarEfeitos } from "./cancelamentos.plano"
import { buscar } from "./cancelamentos.execucao"
import { evento } from "@/modules/notificacoes/notificacoes.service"
import type { Escopo, Solicitar } from "./cancelamentos.schema"
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue
export async function previa(
  tx: Tx,
  ctx: Contexto,
  idPedido: number,
  escopo: Escopo,
) {
  const a = await acesso(tx, ctx)
  exigir(a.lerPedido || a.gerente)
  const p = await preparar(tx, ctx, idPedido, escopo)
  return mostrarPrevia(p, a)
}
export async function solicitar(
  tx: Tx,
  ctx: Contexto,
  idPedido: number,
  input: Solicitar,
) {
  exigir((await acesso(tx, ctx)).solicitar)
  const p = await preparar(tx, ctx, idPedido, {
    tipo: input.tipo,
    ...(input.idEntrega ? { idEntrega: input.idEntrega } : {}),
  })
  if (p.hashEstado !== input.hashEstado)
    throw new ConflictError(
      "O pedido mudou desde a prévia. Atualize os efeitos antes de solicitar.",
    )
  if (
    await tx.pedido_cancelamento.findFirst({
      where: {
        id_empresa: ctx.idEmpresa,
        id_pedido_cliente: idPedido,
        status: {
          in: [
            "AGUARDANDO_APROVACAO",
            "AGUARDANDO_EXECUCAO",
            "EXECUTADA_PENDENCIAS",
            "INTERVENCAO",
          ],
        },
      },
    })
  )
    throw new ConflictError(
      "Já existe uma solicitação aberta para este pedido. Consulte e conclua ou rejeite a anterior.",
    )
  const row = await tx.pedido_cancelamento.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_pedido_cliente: idPedido,
      id_solicitante: ctx.idUsuario,
      tipo: input.tipo,
      id_entrega: input.idEntrega,
      id_fechamento_referencia: p.fechamento?.id,
      motivo: input.motivo,
      status: p.efeitos.exigeAprovacao
        ? "AGUARDANDO_APROVACAO"
        : "AGUARDANDO_EXECUCAO",
      exige_aprovacao: p.efeitos.exigeAprovacao,
      referencia_inconsistente: p.efeitos.referenciaInconsistente,
      fechado_em_referencia: p.fechamento?.data_fechamento,
      limite_sem_aprovacao: p.prazo.limite,
      hash_estado: p.hashEstado,
      plano_efeitos: json(p.efeitos),
    },
  })
  await auditar(tx, ctx, "pedido_cancelamento", row.id, null, row)
  await evento(
    tx,
    ctx,
    row.id,
    p.efeitos.exigeAprovacao ? "APROVACAO_PENDENTE" : "SOLICITACAO",
    p.efeitos.exigeAprovacao ? "GERENCIA" : "SOLICITANTE",
    p.efeitos.exigeAprovacao
      ? "Cancelamento aguardando análise"
      : "Cancelamento solicitado",
    `Solicitação ${row.id} do pedido ${idPedido}: os efeitos ainda não foram executados.`,
  )
  return { id: row.id, status: row.status }
}
export async function decidir(
  tx: Tx,
  ctx: Contexto,
  id: number,
  decisao: "APROVADA" | "REJEITADA",
  motivo: string,
) {
  const a = await acesso(tx, ctx)
  exigir(
    a.gerente,
    "A decisão exige autorização gerencial expressa na empresa ativa.",
  )
  const row = await buscar(tx, ctx, id)
  if (
    !["AGUARDANDO_APROVACAO", "AGUARDANDO_EXECUCAO", "INTERVENCAO"].includes(
      row.status,
    ) ||
    row.executado_em
  )
    throw new ConflictError("Solicitação já decidida ou executada.")
  if (row.decisao && row.status !== "INTERVENCAO")
    throw new ConflictError(
      "A decisão já foi registrada; reavalie antes de decidir novamente.",
    )
  if (decisao === "APROVADA" && row.status !== "AGUARDANDO_APROVACAO")
    throw new ConflictError("Reavalie a solicitação antes da aprovação.")
  const depois = await tx.pedido_cancelamento.update({
    where: { id },
    data: {
      status: decisao === "APROVADA" ? "AGUARDANDO_EXECUCAO" : "REJEITADA",
      decisao,
      id_decisor: ctx.idUsuario,
      motivo_decisao: motivo,
      decidido_em: new Date(),
      ultima_falha: null,
    },
  })
  await auditar(tx, ctx, "pedido_cancelamento", id, row, depois)
  await evento(
    tx,
    ctx,
    id,
    decisao,
    "SOLICITANTE",
    decisao === "APROVADA" ? "Cancelamento aprovado" : "Cancelamento rejeitado",
    `Solicitação ${id}: decisão registrada. Nenhum efeito foi executado pela decisão.`,
    `${decisao}:${depois.decidido_em!.getTime()}`,
  )
  return { id, status: depois.status }
}
export async function reavaliar(
  tx: Tx,
  ctx: Contexto,
  id: number,
  hashEstado: string,
  motivo: string,
) {
  const a = await acesso(tx, ctx)
  exigir(a.solicitar || a.gerente)
  const row = await buscar(tx, ctx, id)
  if (
    row.executado_em ||
    !["AGUARDANDO_APROVACAO", "AGUARDANDO_EXECUCAO", "INTERVENCAO"].includes(
      row.status,
    )
  )
    throw new ConflictError(
      "Somente uma solicitação ainda não executada pode ser reavaliada.",
    )
  const p = await preparar(tx, ctx, row.id_pedido_cliente, {
    tipo: row.tipo as Escopo["tipo"],
    ...(row.id_entrega ? { idEntrega: row.id_entrega } : {}),
  })
  if (p.hashEstado !== hashEstado)
    throw new ConflictError("Atualize a prévia antes de reavaliar.")
  if ((p.fechamento?.id ?? null) !== row.id_fechamento_referencia)
    throw new ConflictError(
      "O fechamento de referência mudou. Rejeite esta solicitação e registre outra, preservando a referência histórica.",
    )
  if (
    p.fechamento?.data_fechamento.getTime() !==
    row.fechado_em_referencia?.getTime()
  )
    throw new ConflictError(
      "A data histórica do fechamento foi alterada. A referência original deve ser analisada pelo responsável, sem reiniciar o prazo.",
    )
  const exige = row.exige_aprovacao || p.efeitos.exigeAprovacao
  const depois = await tx.pedido_cancelamento.update({
    where: { id },
    data: {
      status: exige ? "AGUARDANDO_APROVACAO" : "AGUARDANDO_EXECUCAO",
      exige_aprovacao: exige,
      referencia_inconsistente: p.efeitos.referenciaInconsistente,
      hash_estado: p.hashEstado,
      plano_efeitos: json(p.efeitos),
      decisao: null,
      id_decisor: null,
      motivo_decisao: null,
      decidido_em: null,
      ultima_falha: null,
    },
  })
  await auditar(tx, ctx, "pedido_cancelamento", id, row, {
    ...depois,
    motivoReavaliacao: motivo,
  })
  await evento(
    tx,
    ctx,
    id,
    "REAVALIACAO",
    exige ? "GERENCIA" : "SOLICITANTE",
    "Cancelamento reavaliado",
    `Solicitação ${id}: efeitos atualizados; decisões anteriores não autorizam a nova execução.`,
    `reavaliacao:${Date.now()}`,
  )
  return { id, status: depois.status }
}
export async function registrarIntervencao(tx: Tx, ctx: Contexto, id: number) {
  exigir((await acesso(tx, ctx)).solicitar)
  const row = await buscar(tx, ctx, id)
  if (
    row.executado_em ||
    !["AGUARDANDO_EXECUCAO", "INTERVENCAO"].includes(row.status)
  )
    return
  const depois = await tx.pedido_cancelamento.update({
    where: { id },
    data: {
      status: "INTERVENCAO",
      ultima_falha:
        "Execução não confirmada. Consulte a origem, atualize a prévia e reavalie antes de tentar novamente.",
    },
  })
  await auditar(tx, ctx, "pedido_cancelamento", id, row, depois)
  await evento(
    tx,
    ctx,
    id,
    "INTERVENCAO",
    "GERENCIA",
    "Cancelamento precisa de revisão",
    `Solicitação ${id}: a execução não foi confirmada; os efeitos da tentativa foram desfeitos.`,
    `intervencao:${Date.now()}`,
  )
}
export async function listar(
  tx: Tx,
  ctx: Contexto,
  pagina: number,
  limite: number,
  idPedido?: number,
) {
  const a = await acesso(tx, ctx)
  exigir(podeConsultar(a))
  const where = {
    id_empresa: ctx.idEmpresa,
    ...(idPedido ? { id_pedido_cliente: idPedido } : {}),
  }
  const [rows, total] = await Promise.all([
    tx.pedido_cancelamento.findMany({
      where,
      orderBy: { id: "desc" },
      skip: (pagina - 1) * limite,
      take: limite,
      include: { pedido_cliente: { select: { numero: true } } },
    }),
    tx.pedido_cancelamento.count({ where }),
  ])
  return {
    itens: rows.map((r) => ({
      id: r.id,
      idPedido: r.id_pedido_cliente,
      numeroPedido: r.pedido_cliente.numero,
      tipo: r.tipo,
      status: r.status,
      motivo: r.motivo,
      solicitadoEm: r.solicitado_em,
      exigeAprovacao: r.exige_aprovacao,
    })),
    total,
    pagina,
    limite,
    permissoes: a,
  }
}
export async function detalhe(tx: Tx, ctx: Contexto, id: number) {
  const a = await acesso(tx, ctx)
  exigir(podeConsultar(a))
  const row = await buscar(tx, ctx, id)
  const pedido = await tx.pedido_cliente.findUniqueOrThrow({
    where: { id: row.id_pedido_cliente },
    select: { numero: true, status: true },
  })
  const entregas = await tx.pedido_cliente_entrega.findMany({
    where: { id_pedido_cliente: row.id_pedido_cliente },
    select: { id: true, numero_entrega: true, status: true },
    orderBy: { id: "asc" },
  })
  const linhas = a.estoque
    ? await tx.pedido_devolucao_linha.findMany({
        where: {
          id_empresa: ctx.idEmpresa,
          pedido_entrega_estorno: { id_cancelamento: id },
        },
        orderBy: { id: "asc" },
        include: {
          movimentacao_estoque: {
            include: { produtos: { select: { nome: true, unidade: true } } },
          },
          pedido_devolucao_recebimento: {
            include: { pedido_devolucao_destinacao: true },
          },
        },
      })
    : []
  const creditos = a.financeiro
    ? await tx.pedido_credito_receber.findMany({
        where: { id_empresa: ctx.idEmpresa, id_cancelamento: id },
        orderBy: { id: "asc" },
        include: {
          pedido_reembolso: { include: { movimentacoes_financeiras: true } },
        },
      })
    : []
  const plano =
    row.plano_efeitos &&
    typeof row.plano_efeitos === "object" &&
    !Array.isArray(row.plano_efeitos)
      ? { ...row.plano_efeitos }
      : {}
  const autores = await tx.usuarios.findMany({
    where: {
      id: {
        in: [row.id_solicitante, ...(row.id_decisor ? [row.id_decisor] : [])],
      },
    },
    select: { id: true, nome: true },
  })
  return {
    id: row.id,
    idPedido: row.id_pedido_cliente,
    numeroPedido: pedido.numero,
    statusPedido: pedido.status,
    tipo: row.tipo,
    idEntrega: row.id_entrega,
    motivo: row.motivo,
    status: row.status,
    exigeAprovacao: row.exige_aprovacao,
    referenciaInconsistente: row.referencia_inconsistente,
    fechadoEm: row.fechado_em_referencia,
    limiteSemAprovacao: row.limite_sem_aprovacao,
    solicitadoEm: row.solicitado_em,
    solicitante: autores.find((u) => u.id === row.id_solicitante)?.nome,
    decisao: row.decisao,
    motivoDecisao: row.motivo_decisao,
    decisor: autores.find((u) => u.id === row.id_decisor)?.nome,
    decididoEm: row.decidido_em,
    executadoEm: row.executado_em,
    concluidoEm: row.concluido_em,
    ultimaFalha: row.ultima_falha,
    plano: projetarEfeitos(plano, a),
    entregas,
    permissoes: a,
    devolucoes: linhas.map((l) => ({
      id: l.id,
      idMovimentoOriginal: l.id_movimento_saida,
      idProduto: l.movimentacao_estoque.id_produto,
      idVariacao: l.movimentacao_estoque.id_variacao,
      produto: l.movimentacao_estoque.produtos.nome,
      unidade: l.movimentacao_estoque.produtos.unidade,
      idLocalOrigem: l.movimentacao_estoque.id_local_estoque,
      idSetorOrigem: l.movimentacao_estoque.id_setor,
      prevista: l.quantidade_prevista.toFixed(3),
      recebida: l.pedido_devolucao_recebimento
        .reduce((s, r) => s.plus(r.quantidade), new Prisma.Decimal(0))
        .toFixed(3),
      recebimentos: l.pedido_devolucao_recebimento.map((r) => ({
        id: r.id,
        quantidade: r.quantidade.toFixed(3),
        condicao: r.condicao,
        recebidoEm: r.recebido_em,
        idResponsavel: r.id_usuario,
        observacao: r.observacao,
        destinada: r.pedido_devolucao_destinacao
          .reduce((s, d) => s.plus(d.quantidade), new Prisma.Decimal(0))
          .toFixed(3),
        destinacoes: r.pedido_devolucao_destinacao,
      })),
    })),
    creditos: creditos.map((c) => ({
      id: c.id,
      idTitulo: c.id_conta_receber,
      valor: c.valor.toFixed(2),
      saldoAnulado: c.saldo_anulado.toFixed(2),
      restituir: c.valor_restituir.toFixed(2),
      reembolsado: c.pedido_reembolso
        .reduce((s, r) => s.plus(r.valor), new Prisma.Decimal(0))
        .toFixed(2),
      reembolsos: c.pedido_reembolso.map((r) => ({
        id: r.id,
        idResponsavel: r.id_usuario,
        valor: r.valor.toFixed(2),
        data: r.data_pagamento,
        idContaBancaria: r.id_conta_bancaria,
        referencia: r.referencia,
        idMovimentos: r.movimentacoes_financeiras.map((m) => m.id),
      })),
    })),
    opcoes: {
      locais: a.estoque
        ? await tx.locais_estoque.findMany({
            where: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
            select: { id: true, nome: true },
            orderBy: { nome: "asc" },
          })
        : [],
      setores: a.estoque
        ? await tx.setores.findMany({
            where: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
            select: { id: true, nome: true },
            orderBy: { nome: "asc" },
          })
        : [],
      contas: a.financeiro
        ? await tx.contas_bancarias.findMany({
            where: { id_empresa: ctx.idEmpresa, status: "ATIVA" },
            select: { id: true, nome: true },
            orderBy: { nome: "asc" },
          })
        : [],
    },
    historico: await tx.auditoria.findMany({
      where: {
        id_empresa: ctx.idEmpresa,
        tabela: "pedido_cancelamento",
        id_registro: id,
      },
      select: { id: true, id_usuario: true, acao: true, data_evento: true },
      orderBy: { id: "asc" },
    }),
  }
}

export async function registrarFalhaEtapa(
  tx: Tx,
  ctx: Contexto,
  id: number,
  etapa: string,
  chave: string,
) {
  const a = await acesso(tx, ctx)
  exigir(
    etapa === "reembolsos"
      ? a.editarFinanceiro
      : etapa === "destinacoes"
        ? a.editarEstoque && a.gerente
        : a.editarEstoque,
  )
  const row = await buscar(tx, ctx, id)
  if (!row.executado_em || row.status !== "EXECUTADA_PENDENCIAS") return
  const depois = await tx.pedido_cancelamento.update({
    where: { id },
    data: {
      ultima_falha:
        "Etapa não confirmada. Consulte a origem e o histórico antes de repetir a mesma tentativa.",
    },
  })
  await auditar(tx, ctx, "pedido_cancelamento", id, row, { ...depois, etapa })
  await evento(
    tx,
    ctx,
    id,
    "FALHA_ETAPA",
    etapa === "reembolsos" ? "FINANCEIRO" : "ESTOQUE",
    "Etapa do cancelamento precisa de revisão",
    `Solicitação ${id}: uma etapa não foi confirmada. Nenhum efeito dessa tentativa foi registrado.`,
    chaveMovimento(`falha:${etapa}`, chave),
  )
}

import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors"
import { bloquearProdutoEstoque } from "@/modules/estoque/estoque.livro"
import { conferirSaldoGrade } from "@/modules/estoque/estoque.grade-saldo"
import { auditar, conferir, type Tx, type Contexto } from "./operacoes"
import type { ReservaInput } from "./reservas.schema"

export const restante = (r: {
  quantidade: Prisma.Decimal
  quantidade_consumida: Prisma.Decimal
  quantidade_liberada: Prisma.Decimal
}) => r.quantidade.minus(r.quantidade_consumida).minus(r.quantidade_liberada)
export async function posicao(
  tx: Tx,
  ctx: Contexto,
  produto: number,
  local: number,
  variacao?: number,
  exigirAtivo = true,
) {
  await bloquearProdutoEstoque(tx, ctx, produto)
  const row = await tx.estoque.findUnique({
    where: {
      id_empresa_id_local_estoque_id_produto: {
        id_empresa: ctx.idEmpresa,
        id_produto: produto,
        id_local_estoque: local,
      },
    },
    include: {
      produtos: true,
      locais_estoque: true,
      setores: true,
      estoque_variacao: true,
    },
  })
  const pe = await tx.produto_empresa.findFirst({
    where: { id_empresa: ctx.idEmpresa, id_produto: produto },
  })
  if (
    !row ||
    !pe ||
    row.locais_estoque.id_empresa !== ctx.idEmpresa ||
    row.setores.id_empresa !== ctx.idEmpresa ||
    (exigirAtivo &&
      (pe.status !== "ATIVO" ||
        row.produtos.status !== "ATIVO" ||
        !row.produtos.controla_estoque ||
        row.locais_estoque.status !== "ATIVO" ||
        row.setores.status !== "ATIVO"))
  )
    throw new NotFoundError("Posição ativa não encontrada na empresa.")
  const reservas = await tx.reserva_estoque.groupBy({
    by: ["id_variacao"],
    where: {
      id_empresa: ctx.idEmpresa,
      id_produto: produto,
      id_local_estoque: local,
      status: "ATIVA",
    },
    _sum: {
      quantidade: true,
      quantidade_consumida: true,
      quantidade_liberada: true,
    },
  })
  const quantidades = new Map(
    reservas.map((r) => [
      r.id_variacao,
      new Prisma.Decimal(r._sum.quantidade ?? 0)
        .minus(r._sum.quantidade_consumida ?? 0)
        .minus(r._sum.quantidade_liberada ?? 0),
    ]),
  )
  const total = [...quantidades.values()].reduce(
    (s, q) => s.plus(q),
    new Prisma.Decimal(0),
  )
  if (!total.eq(row.quantidade_reservada))
    throw new ConflictError(
      "Projeção de reservas divergente. Regularização necessária.",
    )
  const grade = variacao
    ? row.estoque_variacao.find((v) => v.id_variacao === variacao)
    : null
  const gradeFisica = row.estoque_variacao.reduce(
    (s, v) => s.plus(v.quantidade),
    new Prisma.Decimal(0),
  )
  const gradeReservada = row.estoque_variacao.reduce(
    (s, v) => s.plus(v.quantidade_reservada),
    new Prisma.Decimal(0),
  )
  if (
    gradeFisica.gt(row.quantidade) ||
    gradeReservada.gt(row.quantidade_reservada) ||
    row.quantidade_reservada.gt(row.quantidade)
  )
    throw new ConflictError(
      "O agregado e o detalhamento da posição divergem. Regularização necessária.",
    )
  if (variacao && !grade)
    throw new ConflictError(
      "A variação não possui saldo físico identificado neste local.",
    )
  if (grade) {
    if (
      exigirAtivo &&
      !(await tx.produto_variacoes.findFirst({
        where: {
          id: variacao,
          id_produto: produto,
          id_empresa: ctx.idEmpresa,
          status: "ATIVO",
        },
      }))
    )
      throw new NotFoundError("Variação ativa não encontrada na empresa.")
    await conferirSaldoGrade(
      tx,
      ctx,
      produto,
      local,
      grade.id_variacao,
      grade.quantidade,
    )
  }
  const fisica =
    grade?.quantidade ??
    row.quantidade.minus(
      row.estoque_variacao.reduce(
        (s, v) => s.plus(v.quantidade),
        new Prisma.Decimal(0),
      ),
    )
  const reservada =
    grade?.quantidade_reservada ??
    row.quantidade_reservada.minus(
      row.estoque_variacao.reduce(
        (s, v) => s.plus(v.quantidade_reservada),
        new Prisma.Decimal(0),
      ),
    )
  if (fisica.lt(0) || reservada.lt(0) || reservada.gt(fisica))
    throw new ConflictError("Saldo físico e grade exigem regularização.")
  if (!reservada.eq(quantidades.get(variacao ?? null) ?? 0))
    throw new ConflictError("A reserva da variação diverge do histórico ativo.")
  return { row, grade, disponivel: fisica.minus(reservada) }
}
export async function reservar(tx: Tx, ctx: Contexto, input: ReservaInput) {
  const q = new Prisma.Decimal(input.quantidade)
  let necessidade: number | undefined
  if (input.origem === "PEDIDO") {
    await conferir(tx, ctx, [["PEDIDOS", "editar"]])
    const item = await tx.pedido_cliente_item.findFirst({
      where: {
        id: input.idItem,
        id_pedido_cliente: input.idOrigem,
        pedido_cliente: { id_empresa: ctx.idEmpresa },
      },
      include: {
        pedido_cliente: true,
        reserva_estoque: true,
        pedido_cliente_entrega_item: {
          include: { pedido_cliente_entrega: true },
        },
      },
    })
    if (
      !input.idItem ||
      !item ||
      item.id_produto !== input.idProduto ||
      item.id_variacao !== (input.idVariacao ?? null)
    )
      throw new NotFoundError("Item e variação não encontrados neste pedido.")
    if (
      ![
        "CONFIRMADO",
        "EM_PRODUCAO",
        "PRONTO",
        "EM_ENTREGA",
        "PARCIALMENTE_ENTREGUE",
      ].includes(item.pedido_cliente.status)
    )
      throw new ConflictError(
        "Confirme o pedido antes de reservar; rascunhos não criam reservas.",
      )
    const entregue = item.pedido_cliente_entrega_item
      .filter(
        (e) =>
          !["CANCELADA", "PREPARANDO", "NAO_ENTREGUE"].includes(
            e.pedido_cliente_entrega.status,
          ),
      )
      .reduce((s, e) => s.plus(e.quantidade), new Prisma.Decimal(0))
    const ativa = item.reserva_estoque
      .filter((r) => r.status === "ATIVA")
      .reduce((s, r) => s.plus(restante(r)), new Prisma.Decimal(0))
    if (q.gt(item.quantidade.minus(entregue).minus(ativa)))
      throw new ConflictError("Reserva excede a quantidade pendente do item.")
  } else {
    await conferir(tx, ctx, [["ORDENS_PRODUCAO", "editar"]])
    const op = await tx.ordem_producao.findFirst({
      where: { id: input.idOrigem, id_empresa: ctx.idEmpresa },
      include: {
        ordem_producao_consumo_planejado: {
          where: { id_materia_prima: input.idProduto },
        },
      },
    })
    if (
      !op ||
      !["LIBERADA", "EM_PRODUCAO", "PAUSADA", "AGUARDANDO_MATERIAL"].includes(
        op.status,
      )
    )
      throw new ConflictError(
        "A OP deve estar liberada para reservar insumos do planejamento.",
      )
    const planejado = op.ordem_producao_consumo_planejado.reduce(
      (s, v) => s.plus(v.quantidade_necessaria),
      new Prisma.Decimal(0),
    )
    if (!planejado.gt(0))
      throw new ValidationError(
        "O produto não é um insumo previsto na ficha desta OP.",
      )
    const n = await tx.necessidade_producao.upsert({
      where: {
        id_ordem_producao_id_produto: {
          id_ordem_producao: op.id,
          id_produto: input.idProduto,
        },
      },
      create: {
        id_ordem_producao: op.id,
        id_produto: input.idProduto,
        quantidade_necessaria: planejado,
      },
      update: {},
    })
    if (
      n.consumo_confirmado_em ||
      q.gt(
        planejado.minus(n.quantidade_consumida).minus(n.quantidade_reservada),
      )
    )
      throw new ConflictError(
        "Reserva excede a necessidade ainda pendente ou o consumo já foi confirmado.",
      )
    necessidade = n.id
    await tx.necessidade_producao.update({
      where: { id: n.id },
      data: {
        quantidade_reservada: n.quantidade_reservada.plus(q),
        status: n.quantidade_reservada
          .plus(q)
          .gte(planejado.minus(n.quantidade_consumida))
          ? "RESERVADA"
          : "PARCIAL",
      },
    })
  }
  const p = await posicao(
    tx,
    ctx,
    input.idProduto,
    input.idLocalEstoque,
    input.idVariacao,
  )
  if (q.gt(p.disponivel))
    throw new ConflictError(
      "Saldo disponível insuficiente na localização e variação. Nenhuma reserva parcial foi criada.",
    )
  const row = await tx.reserva_estoque.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_produto: input.idProduto,
      id_variacao: input.idVariacao,
      id_local_estoque: input.idLocalEstoque,
      id_setor: p.row.id_setor,
      id_pedido_cliente_item:
        input.origem === "PEDIDO" ? input.idItem : undefined,
      id_ordem_producao:
        input.origem === "PRODUCAO" ? input.idOrigem : undefined,
      id_necessidade_producao: necessidade,
      tipo_origem: input.origem === "PEDIDO" ? "VENDA" : "ORDEM_PRODUCAO",
      quantidade: q,
      protocolo_integrado: true,
      id_usuario: ctx.idUsuario,
    },
  })
  await tx.estoque.update({
    where: { id: p.row.id },
    data: {
      quantidade_reservada: { increment: q },
      data_atualizacao: new Date(),
    },
  })
  if (p.grade)
    await tx.estoque_variacao.update({
      where: { id: p.grade.id },
      data: { quantidade_reservada: { increment: q } },
    })
  await auditar(tx, ctx, "reserva_estoque", row.id, null, row)
  return { idReserva: row.id, quantidadeReservada: q.toFixed(3) }
}
export async function finalizarReserva(
  tx: Tx,
  ctx: Contexto,
  id: number,
  quantidade: Prisma.Decimal,
  consumo: boolean,
  motivo: string,
) {
  const antes = await tx.reserva_estoque.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
  })
  if (
    !antes ||
    !antes.protocolo_integrado ||
    !antes.id_local_estoque ||
    !antes.id_setor
  )
    throw new ConflictError(
      "Reserva indisponível ou legada; regularização necessária.",
    )
  const p = await posicao(
    tx,
    ctx,
    antes.id_produto,
    antes.id_local_estoque,
    antes.id_variacao ?? undefined,
    consumo,
  )
  if (
    antes.status !== "ATIVA" ||
    quantidade.lte(0) ||
    quantidade.gt(restante(antes))
  )
    throw new ConflictError("Quantidade maior que o saldo ativo da reserva.")
  const falta = restante(antes).minus(quantidade)
  const consumida = antes.quantidade_consumida.plus(consumo ? quantidade : 0)
  const depois = await tx.reserva_estoque.update({
    where: { id },
    data: {
      quantidade_consumida: consumida,
      quantidade_liberada: antes.quantidade_liberada.plus(
        consumo ? 0 : quantidade,
      ),
      status: falta.isZero()
        ? consumida.gt(0)
          ? "ATENDIDA"
          : "CANCELADA"
        : "ATIVA",
      data_finalizacao: falta.isZero() ? new Date() : null,
    },
  })
  await tx.estoque.update({
    where: { id: p.row.id },
    data: {
      quantidade_reservada: { decrement: quantidade },
      data_atualizacao: new Date(),
    },
  })
  if (p.grade)
    await tx.estoque_variacao.update({
      where: { id: p.grade.id },
      data: { quantidade_reservada: { decrement: quantidade } },
    })
  if (antes.id_necessidade_producao) {
    const n = await tx.necessidade_producao.findUniqueOrThrow({
      where: { id: antes.id_necessidade_producao },
    })
    const reservado = n.quantidade_reservada.minus(quantidade)
    const consumido = n.quantidade_consumida.plus(consumo ? quantidade : 0)
    if (reservado.lt(0))
      throw new ConflictError("A projeção da necessidade diverge das reservas.")
    await tx.necessidade_producao.update({
      where: { id: n.id },
      data: {
        quantidade_reservada: reservado,
        quantidade_consumida: consumido,
        status: reservado.gt(0)
          ? reservado.gte(n.quantidade_necessaria.minus(consumido))
            ? "RESERVADA"
            : "PARCIAL"
          : consumido.gt(0)
            ? "PARCIAL"
            : "PENDENTE",
      },
    })
  }
  await auditar(tx, ctx, "reserva_estoque", id, antes, {
    ...depois,
    evento: consumo ? "CONSUMO" : "LIBERACAO",
    motivo,
  })
  return antes
}
export async function liberarReservasOP(tx: Tx, ctx: Contexto, id: number) {
  const reservas = await tx.reserva_estoque.findMany({
    where: {
      id_empresa: ctx.idEmpresa,
      id_ordem_producao: id,
      protocolo_integrado: true,
      status: "ATIVA",
    },
    orderBy: { id: "asc" },
  })
  if (reservas.length) await conferir(tx, ctx, [["ESTOQUE", "editar"]])
  for (const reserva of reservas)
    await finalizarReserva(
      tx,
      ctx,
      reserva.id,
      restante(reserva),
      false,
      "Cancelamento da OP; sem devolução física",
    )
  await tx.necessidade_producao.updateMany({
    where: {
      id_ordem_producao: id,
      ordem_producao: { id_empresa: ctx.idEmpresa },
      quantidade_consumida: 0,
      quantidade_reservada: 0,
      consumo_confirmado_em: null,
    },
    data: { status: "CANCELADA" },
  })
}

import "server-only"
import { randomUUID } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { ContextoVenda } from "./vendas.authorization"
import { VendaError } from "./vendas.error"
import type { CriarVenda, EditarVenda, ListarVenda } from "./vendas.schema"

const include = {
  clientes: { select: { id: true, nome_razao_social: true } },
  pedido_cliente: { select: { id: true, numero: true } },
  item_venda: {
    orderBy: { id: "asc" as const },
    include: {
      produtos: {
        select: {
          nome: true,
          codigo: true,
          produto_variacoes: {
            select: {
              id: true,
              id_empresa: true,
              id_cor: true,
              id_tamanho: true,
            },
          },
        },
      },
      cores: { select: { nome: true } },
      tamanhos: { select: { nome: true } },
    },
  },
  historico_status: {
    orderBy: { data_evento: "desc" as const },
    take: 20,
  },
} satisfies Prisma.vendaInclude
const LIMITE_MOEDA = new Prisma.Decimal("9999999999999.99")

function serializar(
  venda: Prisma.vendaGetPayload<{ include: typeof include }>,
) {
  return {
    id: venda.id,
    idEmpresa: venda.id_empresa,
    numero: venda.numero,
    idCliente: venda.id_cliente,
    cliente: venda.clientes?.nome_razao_social ?? null,
    idPedido: venda.id_pedido_cliente,
    pedido: venda.pedido_cliente?.numero ?? "—",
    data: venda.data_venda.toISOString(),
    status: venda.status,
    subtotal: venda.valor_subtotal.toFixed(2),
    desconto: venda.valor_desconto.toFixed(2),
    frete: venda.valor_frete.toFixed(2),
    acrescimo: venda.valor_acrescimo.toFixed(2),
    total: venda.valor_total.toFixed(2),
    items: venda.item_venda.map((item) => ({
      idProduto: item.id_produto,
      produto: item.produtos.nome,
      codigo: item.produtos.codigo,
      idVariacao:
        item.id_cor === null && item.id_tamanho === null
          ? null
          : (item.produtos.produto_variacoes.find(
              (variacao) =>
                variacao.id_empresa === venda.id_empresa &&
                variacao.id_cor === item.id_cor &&
                variacao.id_tamanho === item.id_tamanho,
            )?.id ?? null),
      variacao: [item.cores?.nome, item.tamanhos?.nome]
        .filter(Boolean)
        .join(" · "),
      quantidade: item.quantidade.toFixed(3),
      unitario: item.valor_unitario.toFixed(2),
      total: item.valor_total.toFixed(2),
    })),
    historico: venda.historico_status.map((item) => ({
      statusAnterior: item.status_anterior,
      statusNovo: item.status_novo,
      observacao: item.observacao,
      data: item.data_evento.toISOString(),
    })),
  }
}

async function carregarItens(
  tx: Prisma.TransactionClient,
  ctx: ContextoVenda,
  itens: CriarVenda["itens"],
) {
  const catalogo = await tx.produto_empresa.findMany({
    where: {
      id_empresa: ctx.idEmpresa,
      id_produto: { in: itens.map((item) => item.idProduto) },
      status: "ATIVO",
      produtos: { status: "ATIVO", permite_venda: true },
    },
    include: {
      produtos: {
        include: {
          produto_variacoes: {
            where: { id_empresa: ctx.idEmpresa },
            include: { cores: true, tamanhos: true },
          },
        },
      },
    },
  })
  const vinculos = new Map(
    catalogo.map((vinculo) => [vinculo.id_produto, vinculo]),
  )
  if (vinculos.size !== new Set(itens.map((item) => item.idProduto)).size)
    throw new VendaError(
      409,
      "Um ou mais produtos não estão disponíveis nesta empresa.",
    )
  return itens.map((item) => {
    const vinculo = vinculos.get(item.idProduto)!
    const variacoes = vinculo.produtos.produto_variacoes
    const temGrade =
      vinculo.id_cor !== null ||
      vinculo.id_tamanho !== null ||
      variacoes.some(
        (variacao) => variacao.id_cor !== null || variacao.id_tamanho !== null,
      )
    const variacao =
      item.idVariacao === null
        ? null
        : variacoes.find((opcao) => opcao.id === item.idVariacao)
    if (item.idVariacao !== null && !variacao)
      throw new VendaError(
        409,
        "A variação selecionada não pertence ao produto desta empresa.",
      )
    if (temGrade && variacoes.length > 0 && !variacao)
      throw new VendaError(
        409,
        "Selecione cor e tamanho para o produto com grade.",
      )
    if (
      variacao &&
      (variacao.status !== "ATIVO" ||
        (variacao.cores &&
          (variacao.cores.status !== "ATIVA" ||
            (variacao.cores.id_empresa !== null &&
              variacao.cores.id_empresa !== ctx.idEmpresa))) ||
        (variacao.tamanhos &&
          (variacao.tamanhos.status !== "ATIVO" ||
            variacao.tamanhos.id_empresa !== ctx.idEmpresa)))
    )
      throw new VendaError(409, "A variação selecionada não está ativa.")
    const quantidade = new Prisma.Decimal(item.quantidade)
    const valorUnitario = new Prisma.Decimal(item.valorUnitario)
    const valorTotal = quantidade.mul(valorUnitario).toDecimalPlaces(2)
    if (valorTotal.gt(LIMITE_MOEDA))
      throw new VendaError(400, "O total do item supera o limite aceito.")
    return {
      id_produto: item.idProduto,
      id_cor: variacao ? variacao.id_cor : vinculo.id_cor,
      id_tamanho: variacao ? variacao.id_tamanho : vinculo.id_tamanho,
      quantidade,
      valor_unitario: valorUnitario,
      valor_total: valorTotal,
    }
  })
}

async function validarVinculos(
  tx: Prisma.TransactionClient,
  ctx: ContextoVenda,
  idCliente: number | null,
  idPedido: number | null,
) {
  if (idCliente !== null) {
    const cliente = await tx.clientes.findFirst({
      where: { id: idCliente, id_empresa: ctx.idEmpresa, status: "ATIVO" },
      select: { id: true },
    })
    if (!cliente)
      throw new VendaError(409, "Cliente não está ativo nesta empresa.")
  }
  if (idPedido !== null) {
    const pedido = await tx.pedido_cliente.findFirst({
      where: { id: idPedido, id_empresa: ctx.idEmpresa },
      select: { id_cliente: true, status: true },
    })
    if (!pedido) throw new VendaError(404, "Pedido não encontrado.")
    if (idCliente === null || pedido.id_cliente !== idCliente)
      throw new VendaError(
        409,
        "O pedido precisa pertencer ao cliente selecionado.",
      )
    if (pedido.status === "CANCELADO")
      throw new VendaError(409, "Não é possível vincular um pedido cancelado.")
  }
}

async function buscar(
  tx: Prisma.TransactionClient,
  ctx: ContextoVenda,
  id: number,
) {
  const venda = await tx.venda.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    include,
  })
  if (!venda) throw new VendaError(404, "Venda não encontrada.")
  return venda
}

async function validarEditavel(
  tx: Prisma.TransactionClient,
  venda: Awaited<ReturnType<typeof buscar>>,
) {
  const [fechamentos, recebiveis, reservas, parcelas] = await Promise.all([
    tx.pedido_cliente_fechamento.count({
      where: { id_venda: venda.id, id_empresa: venda.id_empresa },
    }),
    tx.contas_receber.count({
      where: { id_venda: venda.id, id_empresa: venda.id_empresa },
    }),
    tx.reserva_estoque.count({
      where: { id_venda: venda.id, id_empresa: venda.id_empresa },
    }),
    tx.venda_parcelas.count({
      where: { id_venda: venda.id, id_empresa: venda.id_empresa },
    }),
  ])
  if (fechamentos || recebiveis || reservas || parcelas)
    throw new VendaError(
      409,
      "Esta venda possui vínculos de pedido, financeiro ou estoque e deve ser gerenciada pelo fluxo de origem.",
    )
}

function valores(
  itens: Awaited<ReturnType<typeof carregarItens>>,
  desconto: string,
  frete: string,
  acrescimo: string,
) {
  const subtotal = itens
    .reduce((soma, item) => soma.add(item.valor_total), new Prisma.Decimal(0))
    .toDecimalPlaces(2)
  const desc = new Prisma.Decimal(desconto)
  const shipping = new Prisma.Decimal(frete)
  const surcharge = new Prisma.Decimal(acrescimo)
  const total = subtotal
    .sub(desc)
    .add(shipping)
    .add(surcharge)
    .toDecimalPlaces(2)
  if (subtotal.gt(LIMITE_MOEDA) || total.gt(LIMITE_MOEDA))
    throw new VendaError(400, "O total da venda supera o limite aceito.")
  if (total.isNegative())
    throw new VendaError(
      400,
      "O desconto não pode superar o subtotal mais o frete.",
    )
  return { subtotal, desc, shipping, surcharge, total }
}

export async function listarVendas(ctx: ContextoVenda, filtros: ListarVenda) {
  const vendas = await prisma.venda.findMany({
    where: {
      id_empresa: ctx.idEmpresa,
      ...(filtros.status ? { status: filtros.status } : {}),
      ...(filtros.busca
        ? {
            OR: [
              { numero: { contains: filtros.busca } },
              { clientes: { nome_razao_social: { contains: filtros.busca } } },
              { pedido_cliente: { numero: { contains: filtros.busca } } },
            ],
          }
        : {}),
    },
    include,
    orderBy: [{ data_venda: "desc" }, { id: "desc" }],
    take: 200,
  })
  return { dados: vendas.map(serializar) }
}

export async function consultarVenda(ctx: ContextoVenda, id: number) {
  return serializar(await buscar(prisma, ctx, id))
}

export async function criarVenda(ctx: ContextoVenda, input: CriarVenda) {
  return prisma.$transaction(
    async (tx) => {
      await validarVinculos(tx, ctx, input.idCliente, null)
      const itens = await carregarItens(tx, ctx, input.itens)
      const montantes = valores(
        itens,
        input.desconto,
        input.frete,
        input.acrescimo,
      )
      const numero = `PDV-${new Date().getFullYear()}-${randomUUID().slice(0, 12).toUpperCase()}`
      const venda = await tx.venda.create({
        data: {
          id_empresa: ctx.idEmpresa,
          id_usuario: ctx.idUsuario,
          id_cliente: input.idCliente,
          // O vínculo do pedido é criado exclusivamente pelo fechamento financeiro.
          id_pedido_cliente: null,
          numero,
          status: "RASCUNHO",
          canal_venda: "BALCAO",
          valor_subtotal: montantes.subtotal,
          valor_desconto: montantes.desc,
          valor_frete: montantes.shipping,
          valor_acrescimo: montantes.surcharge,
          valor_total: montantes.total,
          item_venda: {
            create: itens,
          },
          historico_status: {
            create: {
              id_usuario_empresa: ctx.idUsuarioEmpresa,
              status_anterior: null,
              status_novo: "RASCUNHO",
              observacao: "Venda criada pelo PDV.",
            },
          },
        },
        include,
      })
      return serializar(
        venda as Prisma.vendaGetPayload<{ include: typeof include }>,
      )
    },
    { isolationLevel: "Serializable", timeout: 15000 },
  )
}

export async function editarVenda(
  ctx: ContextoVenda,
  id: number,
  input: EditarVenda,
) {
  return prisma.$transaction(
    async (tx) => {
      const atual = await buscar(tx, ctx, id)
      await validarEditavel(tx, atual)
      if (
        atual.status !== "RASCUNHO" &&
        (input.status !== "CANCELADA" || Object.keys(input).length !== 1)
      )
        throw new VendaError(
          409,
          "Vendas concluídas só podem ser canceladas por esta tela.",
        )
      const idCliente =
        input.idCliente === undefined ? atual.id_cliente : input.idCliente
      await validarVinculos(tx, ctx, idCliente, null)

      if (input.status !== undefined) {
        if (
          atual.status === "CANCELADA" ||
          (atual.status !== "RASCUNHO" && input.status !== "CANCELADA")
        )
          throw new VendaError(409, "Transição de status não permitida.")
        if (input.status === "CONFIRMADA" && atual.item_venda.length === 0)
          throw new VendaError(
            409,
            "Inclua ao menos um item antes de concluir a venda.",
          )
      }

      const itens = input.itens
        ? await carregarItens(tx, ctx, input.itens)
        : atual.item_venda.map((item) => ({
            id_produto: item.id_produto,
            id_cor: item.id_cor,
            id_tamanho: item.id_tamanho,
            quantidade: item.quantidade,
            valor_unitario: item.valor_unitario,
            valor_total: item.valor_total,
          }))
      const desconto = input.desconto ?? atual.valor_desconto.toFixed(2)
      const frete = input.frete ?? atual.valor_frete.toFixed(2)
      const acrescimo = input.acrescimo ?? atual.valor_acrescimo.toFixed(2)
      const montantes = valores(itens, desconto, frete, acrescimo)
      if (input.itens)
        await tx.item_venda.deleteMany({
          where: { id_empresa: ctx.idEmpresa, id_venda: id },
        })
      const status = input.status ?? atual.status
      const venda = await tx.venda.update({
        where: { id_empresa_id: { id_empresa: ctx.idEmpresa, id } },
        data: {
          id_cliente: idCliente,
          id_pedido_cliente:
            input.status === "CANCELADA" ? null : atual.id_pedido_cliente,
          valor_subtotal: montantes.subtotal,
          valor_desconto: montantes.desc,
          valor_frete: montantes.shipping,
          valor_acrescimo: montantes.surcharge,
          valor_total: montantes.total,
          status,
          ...(input.status === "CANCELADA"
            ? { status_financeiro: "CANCELADA" as const }
            : {}),
          ...(input.status && input.status !== atual.status
            ? {
                historico_status: {
                  create: {
                    id_usuario_empresa: ctx.idUsuarioEmpresa,
                    status_anterior: atual.status,
                    status_novo: input.status,
                    observacao:
                      input.status === "CANCELADA"
                        ? "Cancelada pelo PDV."
                        : "Concluída pelo PDV.",
                  },
                },
              }
            : {}),
          ...(input.itens
            ? {
                item_venda: {
                  create: itens,
                },
              }
            : {}),
        },
        include,
      })
      return serializar(
        venda as Prisma.vendaGetPayload<{ include: typeof include }>,
      )
    },
    { isolationLevel: "Serializable", timeout: 15000 },
  )
}

export async function excluirVenda(ctx: ContextoVenda, id: number) {
  return prisma.$transaction(
    async (tx) => {
      const venda = await buscar(tx, ctx, id)
      await validarEditavel(tx, venda)
      if (venda.status !== "RASCUNHO")
        throw new VendaError(
          409,
          "Somente vendas em rascunho podem ser excluídas; cancele as demais.",
        )
      await tx.venda.delete({
        where: { id_empresa_id: { id_empresa: ctx.idEmpresa, id } },
      })
      return { sucesso: true }
    },
    { isolationLevel: "Serializable", timeout: 15000 },
  )
}

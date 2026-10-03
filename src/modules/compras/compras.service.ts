import "server-only"
import { Prisma } from "@/generated/prisma/client"
import {
  ComprasError,
  auditar,
  escaparLike,
  exigirFornecedor,
  exigirInsumos,
  exigirLocal,
  exigirSetor,
  fornecedorDaEmpresa,
  gravacao,
  insumoDaEmpresa,
  intervaloDatas,
  leitura,
  paginacao,
  paginar,
  proximoNumero,
  type Contexto,
  type Transaction,
} from "./compras.repository"
import {
  paraEscala,
  proximoStatus,
  quantidadePendente,
  somarValores,
  statusPedidoAposRecebimento,
  totalItem,
  transicoesCompra,
  transicoesNota,
  transicoesPedido,
  transicoesRequisicao,
} from "./compras.regras"
import type {
  CriarCompraInput,
  CriarNotaInput,
  CriarPedidoInput,
  CriarRequisicaoInput,
  EditarNotaInput,
  EditarPedidoInput,
  EditarRequisicaoInput,
  ListarComprasInput,
  ListarNotasInput,
  ListarPedidosInput,
  ListarRequisicoesInput,
  OpcoesInput,
  ReceberCompraInput,
} from "./compras.schema"

const fx = (valor: { toFixed(casas: number): string }, casas: number) =>
  valor.toFixed(casas)
const dinheiro = (v: { toFixed(c: number): string }) => fx(v, 2)
const qtd = (v: { toFixed(c: number): string }) => fx(v, 3)
const dia = (texto: string) => new Date(`${texto}T12:00:00.000Z`)
const contar = (linhas: Array<{ status: string; _count: { _all: number } }>) =>
  Object.fromEntries(linhas.map((l) => [l.status, l._count._all]))
const conflito = (mensagem: string) => new ComprasError(409, mensagem)

function acaoInvalida(acao: string, status: string): never {
  throw conflito(`A ação "${acao}" não é permitida para o status ${status}.`)
}

// =====================================================================================
// SOLICITAÇÕES DE COMPRA  (requisicao_compra / item_requisicao_compra)
// Não movimentam estoque. Status do banco: RASCUNHO, ABERTA (solicitada), APROVADA,
// ATENDIDA (convertida em pedido) e CANCELADA (inclui rejeição).
// =====================================================================================

const incluirRequisicao = {
  usuarios: { select: { id: true, nome: true } },
  setores: { select: { nome: true } },
  locais_estoque: { select: { nome: true } },
  _count: { select: { item_requisicao_compra: true } },
} satisfies Prisma.requisicao_compraInclude

function apresentarRequisicao(
  r: Prisma.requisicao_compraGetPayload<{ include: typeof incluirRequisicao }>,
) {
  return {
    id: r.id,
    numero: r.numero,
    status: r.status,
    dataSolicitacao: r.data_solicitacao.toISOString(),
    solicitante: r.usuarios,
    setor: r.setores?.nome ?? null,
    idLocalEstoque: r.id_local_estoque,
    idSetorSolicitante: r.id_setor_solicitante,
    local: r.locais_estoque?.nome ?? null,
    observacao: r.observacao,
    totalItens: r._count.item_requisicao_compra,
  }
}

async function carregarRequisicao(tx: Transaction, ctx: Contexto, id: number) {
  const r = await tx.requisicao_compra.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    include: {
      ...incluirRequisicao,
      item_requisicao_compra: {
        orderBy: { id: "asc" },
        include: {
          produtos: { select: { codigo: true, nome: true, unidade: true } },
        },
      },
      pedido_compra: {
        select: { id: true, numero: true, status: true },
        orderBy: { id: "asc" },
      },
    },
  })
  if (!r) throw new ComprasError(404, "Solicitação de compra não encontrada.")
  return r
}
function detalheRequisicao(r: Awaited<ReturnType<typeof carregarRequisicao>>) {
  return {
    ...apresentarRequisicao(r),
    itens: r.item_requisicao_compra.map((i) => ({
      id: i.id,
      idProduto: i.id_produto,
      codigo: i.produtos.codigo,
      nome: i.produtos.nome,
      unidade: i.produtos.unidade,
      quantidade: qtd(i.quantidade),
      observacao: i.observacao,
    })),
    pedidos: r.pedido_compra,
  }
}

export function listarRequisicoes(
  ctx: Contexto,
  input: ListarRequisicoesInput,
) {
  return leitura(async (tx) => {
    const where: Prisma.requisicao_compraWhereInput = {
      id_empresa: ctx.idEmpresa,
      status: input.status,
      data_solicitacao: intervaloDatas(input.de, input.ate),
      OR: input.busca
        ? [
            { numero: { contains: escaparLike(input.busca) } },
            { usuarios: { nome: { contains: escaparLike(input.busca) } } },
          ]
        : undefined,
    }
    const [total, linhas, porStatus] = await Promise.all([
      tx.requisicao_compra.count({ where }),
      tx.requisicao_compra.findMany({
        where,
        include: incluirRequisicao,
        orderBy: [{ data_solicitacao: "desc" }, { id: "desc" }],
        ...paginar(input.pagina, input.limite),
      }),
      tx.requisicao_compra.groupBy({
        by: ["status"],
        where: { id_empresa: ctx.idEmpresa },
        _count: { _all: true },
      }),
    ])
    return {
      requisicoes: linhas.map(apresentarRequisicao),
      paginacao: paginacao(input.pagina, input.limite, total),
      resumo: { porStatus: contar(porStatus) },
      permissoes: ctx.pode,
    }
  })
}

export function consultarRequisicao(ctx: Contexto, id: number) {
  return leitura(async (tx) => ({
    requisicao: detalheRequisicao(await carregarRequisicao(tx, ctx, id)),
  }))
}

async function validarRequisicao(
  tx: Transaction,
  ctx: Contexto,
  input: CriarRequisicaoInput | EditarRequisicaoInput,
) {
  if (input.idLocalEstoque) await exigirLocal(tx, ctx, input.idLocalEstoque)
  if (input.idSetorSolicitante)
    await exigirSetor(tx, ctx, input.idSetorSolicitante)
  await exigirInsumos(
    tx,
    ctx,
    input.itens.map((i) => i.idProduto),
  )
}

export function criarRequisicao(ctx: Contexto, input: CriarRequisicaoInput) {
  return gravacao(ctx, async (tx) => {
    await validarRequisicao(tx, ctx, input)
    const criada = await tx.requisicao_compra.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_usuario_solicitante: ctx.idUsuario,
        id_local_estoque: input.idLocalEstoque ?? null,
        id_setor_solicitante: input.idSetorSolicitante ?? null,
        numero: await proximoNumero(tx, ctx.idEmpresa, "requisicao_compra"),
        status: input.enviar ? "ABERTA" : "RASCUNHO",
        observacao: input.observacao || null,
        item_requisicao_compra: {
          create: input.itens.map((i) => ({
            id_produto: i.idProduto,
            quantidade: i.quantidade,
            observacao: i.observacao || null,
          })),
        },
      },
    })
    const depois = await carregarRequisicao(tx, ctx, criada.id)
    await auditar(
      tx,
      ctx,
      "requisicao_compra",
      criada.id,
      null,
      detalheRequisicao(depois),
    )
    return { requisicao: detalheRequisicao(depois) }
  })
}

export function editarRequisicao(
  ctx: Contexto,
  id: number,
  input: EditarRequisicaoInput,
) {
  return gravacao(ctx, async (tx) => {
    const antes = detalheRequisicao(await carregarRequisicao(tx, ctx, id))
    if (antes.status !== "RASCUNHO")
      throw conflito("Somente solicitações em rascunho podem ser editadas.")
    await validarRequisicao(tx, ctx, input)
    await tx.item_requisicao_compra.deleteMany({
      where: { id_requisicao_compra: id },
    })
    await tx.item_requisicao_compra.createMany({
      data: input.itens.map((i) => ({
        id_requisicao_compra: id,
        id_produto: i.idProduto,
        quantidade: i.quantidade,
        observacao: i.observacao || null,
      })),
    })
    const r = await tx.requisicao_compra.updateMany({
      where: { id, id_empresa: ctx.idEmpresa, status: "RASCUNHO" },
      data: {
        id_local_estoque: input.idLocalEstoque ?? null,
        id_setor_solicitante: input.idSetorSolicitante ?? null,
        observacao: input.observacao || null,
      },
    })
    if (r.count !== 1)
      throw conflito("A solicitação foi alterada por outra operação.")
    const depois = detalheRequisicao(await carregarRequisicao(tx, ctx, id))
    await auditar(tx, ctx, "requisicao_compra", id, antes, depois)
    return { requisicao: depois }
  })
}

export function acaoRequisicao(ctx: Contexto, id: number, acao: string) {
  return gravacao(ctx, async (tx) => {
    const antes = detalheRequisicao(await carregarRequisicao(tx, ctx, id))
    const novo = proximoStatus(transicoesRequisicao, acao, antes.status)
    if (!novo) acaoInvalida(acao, antes.status)
    if (
      acao === "cancelar" &&
      antes.pedidos.some((p) => p.status !== "CANCELADO")
    )
      throw conflito(
        "Cancele os pedidos de compra desta solicitação antes de cancelá-la.",
      )
    const r = await tx.requisicao_compra.updateMany({
      where: { id, id_empresa: ctx.idEmpresa, status: antes.status },
      data: { status: novo },
    })
    if (r.count !== 1)
      throw conflito("A solicitação foi alterada por outra operação.")
    const depois = detalheRequisicao(await carregarRequisicao(tx, ctx, id))
    await auditar(tx, ctx, "requisicao_compra", id, antes, depois)
    return { requisicao: depois }
  })
}

// =====================================================================================
// PEDIDOS DE COMPRA  (pedido_compra / item_pedido_compra)
// O schema não possui previsão de entrega, desconto, frete nem total no cabeçalho:
// o total é SEMPRE derivado dos itens (nunca digitado).
// =====================================================================================

const incluirPedido = {
  fornecedores: {
    select: { id: true, razao_social: true, nome_fantasia: true },
  },
  usuarios: { select: { id: true, nome: true } },
  requisicao_compra: { select: { id: true, numero: true } },
  compras: { select: { id: true, codigo: true, status: true } },
  item_pedido_compra: { select: { valor_total: true } },
  _count: { select: { nota_fiscal: true } },
} satisfies Prisma.pedido_compraInclude

const nomeFornecedor = (f: {
  razao_social: string
  nome_fantasia: string | null
}) => f.nome_fantasia?.trim() || f.razao_social

function apresentarPedido(
  p: Prisma.pedido_compraGetPayload<{ include: typeof incluirPedido }>,
) {
  return {
    id: p.id,
    numero: p.numero,
    status: p.status,
    dataPedido: p.data_pedido.toISOString(),
    fornecedor: {
      id: p.fornecedores.id,
      nome: nomeFornecedor(p.fornecedores),
      razaoSocial: p.fornecedores.razao_social,
    },
    responsavel: p.usuarios,
    requisicao: p.requisicao_compra,
    compra: p.compras,
    observacao: p.observacao,
    totalItens: p.item_pedido_compra.length,
    valorTotal: somarValores(
      p.item_pedido_compra.map((i) => dinheiro(i.valor_total)),
    ),
    notasFiscais: p._count.nota_fiscal,
  }
}

async function carregarPedido(tx: Transaction, ctx: Contexto, id: number) {
  const p = await tx.pedido_compra.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    include: {
      ...incluirPedido,
      item_pedido_compra: {
        orderBy: { id: "asc" },
        include: {
          produtos: { select: { codigo: true, nome: true, unidade: true } },
        },
      },
      compras: {
        select: {
          id: true,
          codigo: true,
          status: true,
          compra_itens: { select: { id_produto: true, quantidade: true } },
        },
      },
    },
  })
  if (!p) throw new ComprasError(404, "Pedido de compra não encontrado.")
  return p
}
function detalhePedido(p: Awaited<ReturnType<typeof carregarPedido>>) {
  // Recebido = itens da compra ENTREGUE (1 pedido ↔ no máximo 1 compra, por uk_compra_pedido_legado).
  const entregue = p.compras?.status === "ENTREGUE"
  const recebidoPorProduto = new Map(
    (p.compras?.compra_itens ?? []).map((i) => [
      i.id_produto,
      qtd(i.quantidade),
    ]),
  )
  return {
    ...apresentarPedido(p),
    compra: p.compras
      ? { id: p.compras.id, codigo: p.compras.codigo, status: p.compras.status }
      : null,
    itens: p.item_pedido_compra.map((i) => {
      const pedida = qtd(i.quantidade)
      const recebida = entregue
        ? (recebidoPorProduto.get(i.id_produto) ?? "0.000")
        : "0.000"
      return {
        id: i.id,
        idProduto: i.id_produto,
        codigo: i.produtos.codigo,
        nome: i.produtos.nome,
        unidade: i.produtos.unidade,
        quantidadePedida: pedida,
        quantidadeRecebida: recebida,
        quantidadePendente: quantidadePendente(pedida, recebida),
        valorUnitario: dinheiro(i.valor_unitario),
        valorTotal: dinheiro(i.valor_total),
      }
    }),
  }
}

export function listarPedidos(ctx: Contexto, input: ListarPedidosInput) {
  return leitura(async (tx) => {
    const where: Prisma.pedido_compraWhereInput = {
      id_empresa: ctx.idEmpresa,
      status: input.status,
      id_fornecedor: input.idFornecedor,
      data_pedido: intervaloDatas(input.de, input.ate),
      OR: input.busca
        ? [
            { numero: { contains: escaparLike(input.busca) } },
            {
              fornecedores: {
                razao_social: { contains: escaparLike(input.busca) },
              },
            },
            {
              fornecedores: {
                nome_fantasia: { contains: escaparLike(input.busca) },
              },
            },
          ]
        : undefined,
    }
    const [total, linhas, porStatus, aberto] = await Promise.all([
      tx.pedido_compra.count({ where }),
      tx.pedido_compra.findMany({
        where,
        include: incluirPedido,
        orderBy: [{ data_pedido: "desc" }, { id: "desc" }],
        ...paginar(input.pagina, input.limite),
      }),
      tx.pedido_compra.groupBy({
        by: ["status"],
        where: { id_empresa: ctx.idEmpresa },
        _count: { _all: true },
      }),
      tx.item_pedido_compra.aggregate({
        _sum: { valor_total: true },
        where: {
          pedido_compra: {
            id_empresa: ctx.idEmpresa,
            status: { in: ["EMITIDO", "PARCIAL"] },
          },
        },
      }),
    ])
    return {
      pedidos: linhas.map(apresentarPedido),
      paginacao: paginacao(input.pagina, input.limite, total),
      resumo: {
        porStatus: contar(porStatus),
        valorEmAberto: dinheiro(
          aberto._sum.valor_total ?? new Prisma.Decimal(0),
        ),
      },
      permissoes: ctx.pode,
    }
  })
}

export function consultarPedido(ctx: Contexto, id: number) {
  return leitura(async (tx) => ({
    pedido: detalhePedido(await carregarPedido(tx, ctx, id)),
  }))
}

function itensDoPedido(itens: CriarPedidoInput["itens"]) {
  return itens.map((i) => ({
    id_produto: i.idProduto,
    quantidade: i.quantidade,
    valor_unitario: i.valorUnitario,
    valor_total: totalItem(i.quantidade, i.valorUnitario), // calculado pelo sistema
  }))
}

export function criarPedido(ctx: Contexto, input: CriarPedidoInput) {
  return gravacao(ctx, async (tx) => {
    await exigirFornecedor(tx, ctx, input.idFornecedor)
    await exigirInsumos(
      tx,
      ctx,
      input.itens.map((i) => i.idProduto),
    )
    if (input.idRequisicaoCompra) {
      const req = await tx.requisicao_compra.findFirst({
        where: { id: input.idRequisicaoCompra, id_empresa: ctx.idEmpresa },
        select: { id: true, status: true },
      })
      if (!req)
        throw new ComprasError(400, "Solicitação de compra não encontrada.")
      if (req.status !== "APROVADA")
        throw conflito(
          "Somente solicitações aprovadas podem ser convertidas em pedido.",
        )
      const ok = await tx.requisicao_compra.updateMany({
        where: { id: req.id, id_empresa: ctx.idEmpresa, status: "APROVADA" },
        data: { status: "ATENDIDA" },
      })
      if (ok.count !== 1)
        throw conflito("A solicitação foi alterada por outra operação.")
    }
    const criado = await tx.pedido_compra.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_fornecedor: input.idFornecedor,
        id_requisicao_compra: input.idRequisicaoCompra ?? null,
        id_usuario: ctx.idUsuario,
        numero: await proximoNumero(tx, ctx.idEmpresa, "pedido_compra"),
        status: input.emitir ? "EMITIDO" : "RASCUNHO",
        observacao: input.observacao || null,
        item_pedido_compra: { create: itensDoPedido(input.itens) },
      },
    })
    const depois = detalhePedido(await carregarPedido(tx, ctx, criado.id))
    await auditar(tx, ctx, "pedido_compra", criado.id, null, depois)
    return { pedido: depois }
  })
}

export function editarPedido(
  ctx: Contexto,
  id: number,
  input: EditarPedidoInput,
) {
  return gravacao(ctx, async (tx) => {
    const antes = detalhePedido(await carregarPedido(tx, ctx, id))
    if (antes.status !== "RASCUNHO")
      throw conflito("Somente pedidos em rascunho podem ser editados.")
    await exigirFornecedor(tx, ctx, input.idFornecedor)
    await exigirInsumos(
      tx,
      ctx,
      input.itens.map((i) => i.idProduto),
    )
    await tx.item_pedido_compra.deleteMany({ where: { id_pedido_compra: id } })
    await tx.item_pedido_compra.createMany({
      data: itensDoPedido(input.itens).map((i) => ({
        ...i,
        id_pedido_compra: id,
      })),
    })
    const r = await tx.pedido_compra.updateMany({
      where: { id, id_empresa: ctx.idEmpresa, status: "RASCUNHO" },
      data: {
        id_fornecedor: input.idFornecedor,
        observacao: input.observacao || null,
      },
    })
    if (r.count !== 1)
      throw conflito("O pedido foi alterado por outra operação.")
    const depois = detalhePedido(await carregarPedido(tx, ctx, id))
    await auditar(tx, ctx, "pedido_compra", id, antes, depois)
    return { pedido: depois }
  })
}

export function acaoPedido(ctx: Contexto, id: number, acao: string) {
  return gravacao(ctx, async (tx) => {
    const antes = detalhePedido(await carregarPedido(tx, ctx, id))
    const novo = proximoStatus(transicoesPedido, acao, antes.status)
    if (!novo) acaoInvalida(acao, antes.status)
    if (
      acao === "cancelar" &&
      antes.compra &&
      antes.compra.status !== "CANCELADA"
    )
      throw conflito(
        "Cancele a compra vinculada (e suas notas) antes de cancelar o pedido.",
      )
    const r = await tx.pedido_compra.updateMany({
      where: { id, id_empresa: ctx.idEmpresa, status: antes.status },
      data: { status: novo },
    })
    if (r.count !== 1)
      throw conflito("O pedido foi alterado por outra operação.")
    if (acao === "cancelar" && antes.requisicao) {
      // Reabre a solicitação para nova conversão, se nenhum outro pedido ativo a atende.
      const ativos = await tx.pedido_compra.count({
        where: {
          id_requisicao_compra: antes.requisicao.id,
          id_empresa: ctx.idEmpresa,
          status: { not: "CANCELADO" },
        },
      })
      if (!ativos)
        await tx.requisicao_compra.updateMany({
          where: {
            id: antes.requisicao.id,
            id_empresa: ctx.idEmpresa,
            status: "ATENDIDA",
          },
          data: { status: "APROVADA" },
        })
    }
    const depois = detalhePedido(await carregarPedido(tx, ctx, id))
    await auditar(tx, ctx, "pedido_compra", id, antes, depois)
    return { pedido: depois }
  })
}

// =====================================================================================
// COMPRAS / RECEBIMENTO  (compras / compra_itens)
// EMITIDA = aguardando recebimento · ENTREGUE = recebida. O recebimento NÃO gera movimentação
// de estoque neste módulo (a entrada no estoque pertence ao fluxo de nota fiscal/estoque).
// =====================================================================================

const incluirCompra = {
  fornecedores: {
    select: { id: true, razao_social: true, nome_fantasia: true },
  },
  usuarios: { select: { id: true, nome: true } },
  locais_estoque: { select: { id: true, nome: true } },
  pedido_compra: { select: { id: true, numero: true } },
  compra_itens: { select: { valor_total: true } },
  _count: { select: { nota_fiscal: true } },
} satisfies Prisma.comprasInclude

function apresentarCompra(
  c: Prisma.comprasGetPayload<{ include: typeof incluirCompra }>,
) {
  return {
    id: c.id,
    codigo: c.codigo,
    status: c.status,
    origem: c.origem,
    dataEmissao: c.data_emissao.toISOString(),
    dataAtualizacao: c.data_atualizacao.toISOString(),
    fornecedor: {
      id: c.fornecedores.id,
      nome: nomeFornecedor(c.fornecedores),
      razaoSocial: c.fornecedores.razao_social,
    },
    responsavel: c.usuarios,
    local: c.locais_estoque,
    pedido: c.pedido_compra,
    observacao: c.observacao,
    totalItens: c.compra_itens.length,
    valorTotal: somarValores(
      c.compra_itens.map((i) => dinheiro(i.valor_total)),
    ),
    notasFiscais: c._count.nota_fiscal,
  }
}

async function carregarCompra(tx: Transaction, ctx: Contexto, id: number) {
  const c = await tx.compras.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    include: {
      ...incluirCompra,
      compra_itens: {
        orderBy: { id: "asc" },
        include: {
          produtos: { select: { codigo: true, nome: true, unidade: true } },
        },
      },
      pedido_compra: {
        select: {
          id: true,
          numero: true,
          status: true,
          item_pedido_compra: {
            select: { id_produto: true, quantidade: true },
          },
        },
      },
      nota_fiscal: {
        select: { id: true, numero: true, serie: true, status: true },
        orderBy: { id: "asc" },
      },
    },
  })
  if (!c) throw new ComprasError(404, "Compra não encontrada.")
  return c
}
function detalheCompra(c: Awaited<ReturnType<typeof carregarCompra>>) {
  const pedidas = new Map(
    (c.pedido_compra?.item_pedido_compra ?? []).map((i) => [
      i.id_produto,
      qtd(i.quantidade),
    ]),
  )
  const entregue = c.status === "ENTREGUE"
  return {
    ...apresentarCompra(c),
    pedido: c.pedido_compra
      ? { id: c.pedido_compra.id, numero: c.pedido_compra.numero }
      : null,
    itens: c.compra_itens.map((i) => {
      const recebida = entregue ? qtd(i.quantidade) : "0.000"
      const pedida = pedidas.get(i.id_produto) ?? null // sem pedido, não há "quantidade pedida"
      return {
        id: i.id,
        idProduto: i.id_produto,
        codigo: i.produtos.codigo,
        nome: i.produtos.nome,
        unidade: i.produtos.unidade,
        quantidade: qtd(i.quantidade),
        valorUnitario: dinheiro(i.valor_unitario),
        valorTotal: dinheiro(i.valor_total),
        quantidadePedida: pedida,
        quantidadeRecebida: recebida,
        quantidadePendente:
          pedida === null ? null : quantidadePendente(pedida, recebida),
      }
    }),
    notas: c.nota_fiscal,
  }
}

export function listarCompras(ctx: Contexto, input: ListarComprasInput) {
  return leitura(async (tx) => {
    const where: Prisma.comprasWhereInput = {
      id_empresa: ctx.idEmpresa,
      status: input.status,
      id_fornecedor: input.idFornecedor,
      id_pedido_compra_legado: input.idPedidoCompra,
      data_emissao: intervaloDatas(input.de, input.ate),
      OR: input.busca
        ? [
            { codigo: { contains: escaparLike(input.busca) } },
            {
              pedido_compra: { numero: { contains: escaparLike(input.busca) } },
            },
            {
              fornecedores: {
                razao_social: { contains: escaparLike(input.busca) },
              },
            },
            {
              fornecedores: {
                nome_fantasia: { contains: escaparLike(input.busca) },
              },
            },
          ]
        : undefined,
    }
    const [total, linhas, porStatus, valor] = await Promise.all([
      tx.compras.count({ where }),
      tx.compras.findMany({
        where,
        include: incluirCompra,
        orderBy: [{ data_emissao: "desc" }, { id: "desc" }],
        ...paginar(input.pagina, input.limite),
      }),
      tx.compras.groupBy({
        by: ["status"],
        where: { id_empresa: ctx.idEmpresa },
        _count: { _all: true },
      }),
      tx.compra_itens.aggregate({
        _sum: { valor_total: true },
        where: {
          compras: {
            id_empresa: ctx.idEmpresa,
            status: { in: ["EMITIDA", "ENTREGUE"] },
          },
        },
      }),
    ])
    return {
      compras: linhas.map(apresentarCompra),
      paginacao: paginacao(input.pagina, input.limite, total),
      resumo: {
        porStatus: contar(porStatus),
        valorTotal: dinheiro(valor._sum.valor_total ?? new Prisma.Decimal(0)),
      },
      permissoes: ctx.pode,
    }
  })
}

export function consultarCompra(ctx: Contexto, id: number) {
  return leitura(async (tx) => ({
    compra: detalheCompra(await carregarCompra(tx, ctx, id)),
  }))
}

export function criarCompra(ctx: Contexto, input: CriarCompraInput) {
  return gravacao(ctx, async (tx) => {
    await exigirLocal(tx, ctx, input.idLocalEstoque)
    let idFornecedor: number
    let idOrdemProducao: number | null = null
    let itens: Array<{
      id_produto: number
      quantidade: string
      valor_unitario: string
      valor_total: string
    }>
    if (input.idPedidoCompra) {
      const pedido = await tx.pedido_compra.findFirst({
        where: { id: input.idPedidoCompra, id_empresa: ctx.idEmpresa },
        include: {
          item_pedido_compra: true,
          compras: { select: { codigo: true } },
        },
      })
      if (!pedido)
        throw new ComprasError(400, "Pedido de compra não encontrado.")
      if (pedido.status !== "EMITIDO")
        throw conflito("Somente pedidos emitidos podem gerar uma compra.")
      if (pedido.compras)
        throw conflito(`O pedido já possui a compra ${pedido.compras.codigo}.`)
      idFornecedor = pedido.id_fornecedor
      idOrdemProducao = pedido.id_ordem_producao
      itens = pedido.item_pedido_compra.map((i) => ({
        id_produto: i.id_produto,
        quantidade: qtd(i.quantidade),
        valor_unitario: dinheiro(i.valor_unitario),
        valor_total: dinheiro(i.valor_total),
      }))
    } else {
      idFornecedor = input.idFornecedor!
      await exigirFornecedor(tx, ctx, idFornecedor)
      await exigirInsumos(
        tx,
        ctx,
        input.itens!.map((i) => i.idProduto),
      )
      itens = input.itens!.map((i) => ({
        id_produto: i.idProduto,
        quantidade: i.quantidade,
        valor_unitario: i.valorUnitario,
        valor_total: totalItem(i.quantidade, i.valorUnitario),
      }))
    }
    const criada = await tx.compras.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_local_estoque: input.idLocalEstoque,
        id_fornecedor: idFornecedor,
        id_ordem_producao: idOrdemProducao,
        id_usuario: ctx.idUsuario,
        id_pedido_compra_legado: input.idPedidoCompra ?? null,
        codigo: await proximoNumero(tx, ctx.idEmpresa, "compras"),
        origem: idOrdemProducao ? "ORDEM_PRODUCAO" : "MANUAL",
        status: "EMITIDA",
        data_emissao: new Date(),
        observacao: input.observacao || null,
        compra_itens: { create: itens },
      },
    })
    const depois = detalheCompra(await carregarCompra(tx, ctx, criada.id))
    await auditar(tx, ctx, "compras", criada.id, null, depois)
    return { compra: depois }
  })
}

export function receberCompra(
  ctx: Contexto,
  id: number,
  input: ReceberCompraInput,
) {
  return gravacao(ctx, async (tx) => {
    const compra = await carregarCompra(tx, ctx, id)
    const antes = detalheCompra(compra)
    if (!proximoStatus(transicoesCompra, "receber", antes.status))
      acaoInvalida("receber", antes.status)
    const pedidasPorProduto = new Map(
      (compra.pedido_compra?.item_pedido_compra ?? []).map((i) => [
        i.id_produto,
        qtd(i.quantidade),
      ]),
    )
    const recebidas = new Map<number, string>(
      input.itens
        ? input.itens.map((i) => [i.idProduto, i.quantidade])
        : compra.compra_itens.map((i) => [i.id_produto, qtd(i.quantidade)]),
    )
    for (const [idProduto, quantidade] of recebidas) {
      const item = compra.compra_itens.find((i) => i.id_produto === idProduto)
      if (!item)
        throw new ComprasError(
          400,
          "Há item de recebimento que não pertence à compra.",
        )
      const limite = pedidasPorProduto.get(idProduto) ?? qtd(item.quantidade)
      if (
        (paraEscala(quantidade, 3) ?? BigInt(0)) >
        (paraEscala(limite, 3) ?? BigInt(0))
      )
        throw new ComprasError(
          400,
          `A quantidade recebida de ${item.produtos.nome} excede o pedido (${limite}).`,
        )
    }
    // Recebimento parcial só é seguro quando a quantidade pedida fica registrada no pedido.
    const escala = (v: string | undefined) => paraEscala(v ?? "0", 3)
    const parcial = compra.compra_itens.some(
      (i) => escala(recebidas.get(i.id_produto)) !== escala(qtd(i.quantidade)),
    )
    if (parcial && !compra.pedido_compra)
      throw conflito(
        "Compras sem pedido só aceitam recebimento integral dos itens.",
      )

    for (const item of compra.compra_itens) {
      const quantidade = recebidas.get(item.id_produto)
      if (!quantidade) {
        await tx.compra_itens.delete({ where: { id: item.id } })
      } else {
        await tx.compra_itens.update({
          where: { id: item.id },
          data: {
            quantidade,
            valor_total: totalItem(quantidade, dinheiro(item.valor_unitario)),
          },
        })
      }
    }
    const r = await tx.compras.updateMany({
      where: { id, id_empresa: ctx.idEmpresa, status: "EMITIDA" },
      data: {
        status: "ENTREGUE",
        data_atualizacao: new Date(),
        observacao:
          input.observacao === undefined ? undefined : input.observacao || null,
      },
    })
    if (r.count !== 1)
      throw conflito("A compra foi alterada por outra operação.")

    if (compra.pedido_compra) {
      const status = statusPedidoAposRecebimento(
        [...pedidasPorProduto].map(([idProduto, pedida]) => ({
          pedida,
          recebida: recebidas.get(idProduto) ?? "0.000",
        })),
      )
      await tx.pedido_compra.updateMany({
        where: {
          id: compra.pedido_compra.id,
          id_empresa: ctx.idEmpresa,
          status: "EMITIDO",
        },
        data: { status },
      })
    }
    const depois = detalheCompra(await carregarCompra(tx, ctx, id))
    await auditar(tx, ctx, "compras", id, antes, depois)
    return { compra: depois }
  })
}

export function acaoCompra(ctx: Contexto, id: number, acao: string) {
  return gravacao(ctx, async (tx) => {
    const antes = detalheCompra(await carregarCompra(tx, ctx, id))
    const novo = proximoStatus(transicoesCompra, acao, antes.status)
    if (!novo) acaoInvalida(acao, antes.status)
    if (antes.notas.some((n) => n.status !== "CANCELADA"))
      throw conflito(
        "Cancele as notas fiscais vinculadas antes de cancelar a compra.",
      )
    const r = await tx.compras.updateMany({
      where: { id, id_empresa: ctx.idEmpresa, status: antes.status },
      data: { status: novo, data_atualizacao: new Date() },
    })
    if (r.count !== 1)
      throw conflito("A compra foi alterada por outra operação.")
    const depois = detalheCompra(await carregarCompra(tx, ctx, id))
    await auditar(tx, ctx, "compras", id, antes, depois)
    return { compra: depois }
  })
}

// =====================================================================================
// NOTAS FISCAIS DE ENTRADA  (nota_fiscal) — somente registro e controle; sem SEFAZ, sem estoque.
// =====================================================================================

const incluirNota = {
  fornecedores: {
    select: { id: true, razao_social: true, nome_fantasia: true },
  },
  compras: { select: { id: true, codigo: true } },
  pedido_compra: { select: { id: true, numero: true } },
} satisfies Prisma.nota_fiscalInclude

function apresentarNota(
  n: Prisma.nota_fiscalGetPayload<{ include: typeof incluirNota }>,
) {
  return {
    id: n.id,
    numero: n.numero,
    serie: n.serie,
    chaveAcesso: n.chave_acesso,
    status: n.status,
    dataEmissao: n.data_emissao?.toISOString() ?? null,
    dataRecebimento: n.data_recebimento?.toISOString() ?? null,
    valorTotal: dinheiro(n.valor_total),
    fornecedor: {
      id: n.fornecedores.id,
      nome: nomeFornecedor(n.fornecedores),
      razaoSocial: n.fornecedores.razao_social,
    },
    compra: n.compras,
    pedido: n.pedido_compra,
    entradaProcessada: n.entrada_processada,
    observacao: n.observacao,
  }
}
async function carregarNota(tx: Transaction, ctx: Contexto, id: number) {
  const n = await tx.nota_fiscal.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    include: incluirNota,
  })
  if (!n) throw new ComprasError(404, "Nota fiscal não encontrada.")
  return apresentarNota(n)
}

export function listarNotas(ctx: Contexto, input: ListarNotasInput) {
  return leitura(async (tx) => {
    const busca = input.busca ? escaparLike(input.busca) : undefined
    const where: Prisma.nota_fiscalWhereInput = {
      id_empresa: ctx.idEmpresa,
      status: input.status,
      id_fornecedor: input.idFornecedor,
      id_compra: input.idCompra,
      data_emissao: intervaloDatas(input.de, input.ate),
      OR: busca
        ? [
            { numero: { contains: busca } },
            { chave_acesso: { contains: busca } },
            { fornecedores: { razao_social: { contains: busca } } },
            { fornecedores: { nome_fantasia: { contains: busca } } },
          ]
        : undefined,
    }
    const [total, linhas, porStatus, valor] = await Promise.all([
      tx.nota_fiscal.count({ where }),
      tx.nota_fiscal.findMany({
        where,
        include: incluirNota,
        orderBy: [{ data_emissao: "desc" }, { id: "desc" }],
        ...paginar(input.pagina, input.limite),
      }),
      tx.nota_fiscal.groupBy({
        by: ["status"],
        where: { id_empresa: ctx.idEmpresa },
        _count: { _all: true },
      }),
      tx.nota_fiscal.aggregate({
        _sum: { valor_total: true },
        where: { id_empresa: ctx.idEmpresa, status: { not: "CANCELADA" } },
      }),
    ])
    return {
      notas: linhas.map(apresentarNota),
      paginacao: paginacao(input.pagina, input.limite, total),
      resumo: {
        porStatus: contar(porStatus),
        valorTotal: dinheiro(valor._sum.valor_total ?? new Prisma.Decimal(0)),
      },
      permissoes: ctx.pode,
    }
  })
}

export function consultarNota(ctx: Contexto, id: number) {
  return leitura(async (tx) => ({ nota: await carregarNota(tx, ctx, id) }))
}

/** Valida vínculos (mesma empresa e mesmo fornecedor) e resolve o valor total. */
async function resolverNota(
  tx: Transaction,
  ctx: Contexto,
  input: CriarNotaInput | EditarNotaInput,
  idAtual?: number,
) {
  await exigirFornecedor(tx, ctx, input.idFornecedor)
  let idPedido = input.idPedidoCompra ?? null
  let valorCompra: string | null = null
  if (input.idCompra) {
    const compra = await tx.compras.findFirst({
      where: { id: input.idCompra, id_empresa: ctx.idEmpresa },
      include: { compra_itens: { select: { valor_total: true } } },
    })
    if (!compra) throw new ComprasError(400, "Compra não encontrada.")
    if (compra.status === "CANCELADA")
      throw conflito("Não é possível vincular nota a uma compra cancelada.")
    if (compra.id_fornecedor !== input.idFornecedor)
      throw new ComprasError(
        400,
        "O fornecedor da nota deve ser o mesmo da compra.",
      )
    if (idPedido && compra.id_pedido_compra_legado !== idPedido)
      throw new ComprasError(
        400,
        "A compra informada não pertence ao pedido informado.",
      )
    idPedido = compra.id_pedido_compra_legado
    valorCompra = somarValores(
      compra.compra_itens.map((i) => dinheiro(i.valor_total)),
    )
  }
  if (idPedido) {
    const pedido = await tx.pedido_compra.findFirst({
      where: { id: idPedido, id_empresa: ctx.idEmpresa },
      select: { id_fornecedor: true, status: true },
    })
    if (!pedido) throw new ComprasError(400, "Pedido de compra não encontrado.")
    if (pedido.status === "CANCELADO")
      throw conflito("Não é possível vincular nota a um pedido cancelado.")
    if (pedido.id_fornecedor !== input.idFornecedor)
      throw new ComprasError(
        400,
        "O fornecedor da nota deve ser o mesmo do pedido.",
      )
  }
  const valorTotal = input.valorTotal ?? valorCompra
  if (valorTotal === null)
    throw new ComprasError(400, "Informe o valor total da nota.")
  const duplicada = await tx.nota_fiscal.findFirst({
    where: {
      id: idAtual ? { not: idAtual } : undefined,
      OR: [
        { id_empresa: ctx.idEmpresa, numero: input.numero, serie: input.serie },
        { chave_acesso: input.chaveAcesso },
      ],
    },
    select: { id: true, chave_acesso: true },
  })
  if (duplicada)
    throw conflito(
      duplicada.chave_acesso === input.chaveAcesso
        ? "Esta chave de acesso já está cadastrada."
        : "Já existe uma nota com este número e série.",
    )
  return {
    id_fornecedor: input.idFornecedor,
    id_compra: input.idCompra ?? null,
    id_pedido_compra: idPedido,
    numero: input.numero,
    serie: input.serie,
    chave_acesso: input.chaveAcesso,
    data_emissao: input.dataEmissao ? dia(input.dataEmissao) : null,
    data_recebimento: input.dataRecebimento ? dia(input.dataRecebimento) : null,
    valor_total: valorTotal,
    observacao: input.observacao || null,
  }
}

export function criarNota(ctx: Contexto, input: CriarNotaInput) {
  return gravacao(ctx, async (tx) => {
    const dados = await resolverNota(tx, ctx, input)
    const criada = await tx.nota_fiscal.create({
      data: { ...dados, id_empresa: ctx.idEmpresa, status: "PENDENTE" },
    })
    const depois = await carregarNota(tx, ctx, criada.id)
    await auditar(tx, ctx, "nota_fiscal", criada.id, null, depois)
    return { nota: depois }
  })
}

export function editarNota(ctx: Contexto, id: number, input: EditarNotaInput) {
  return gravacao(ctx, async (tx) => {
    const antes = await carregarNota(tx, ctx, id)
    if (antes.status !== "PENDENTE" || antes.entradaProcessada)
      throw conflito(
        "Somente notas pendentes e sem entrada processada podem ser editadas.",
      )
    const dados = await resolverNota(tx, ctx, input, id)
    const r = await tx.nota_fiscal.updateMany({
      where: {
        id,
        id_empresa: ctx.idEmpresa,
        status: "PENDENTE",
        entrada_processada: false,
      },
      data: dados,
    })
    if (r.count !== 1) throw conflito("A nota foi alterada por outra operação.")
    const depois = await carregarNota(tx, ctx, id)
    await auditar(tx, ctx, "nota_fiscal", id, antes, depois)
    return { nota: depois }
  })
}

export function acaoNota(
  ctx: Contexto,
  id: number,
  acao: string,
  dataRecebimento?: string,
) {
  return gravacao(ctx, async (tx) => {
    const antes = await carregarNota(tx, ctx, id)
    const novo = proximoStatus(transicoesNota, acao, antes.status)
    if (!novo) acaoInvalida(acao, antes.status)
    if (acao === "cancelar" && antes.entradaProcessada)
      throw conflito(
        "Nota com entrada já processada no estoque não pode ser cancelada aqui.",
      )
    const r = await tx.nota_fiscal.updateMany({
      where: { id, id_empresa: ctx.idEmpresa, status: antes.status },
      data: {
        status: novo,
        data_recebimento:
          acao === "receber"
            ? dataRecebimento
              ? dia(dataRecebimento)
              : new Date()
            : undefined,
      },
    })
    if (r.count !== 1) throw conflito("A nota foi alterada por outra operação.")
    const depois = await carregarNota(tx, ctx, id)
    await auditar(tx, ctx, "nota_fiscal", id, antes, depois)
    return { nota: depois }
  })
}

// =====================================================================================
// OPÇÕES para seletores (insumos, fornecedores, locais e setores da empresa)
// =====================================================================================

export function listarOpcoes(ctx: Contexto, input: OpcoesInput) {
  return leitura(async (tx) => {
    const busca = input.busca ? escaparLike(input.busca) : undefined
    const take = input.limite
    if (input.tipo === "insumos") {
      const itens = await tx.produtos.findMany({
        where: {
          ...insumoDaEmpresa(ctx.idEmpresa),
          OR: busca
            ? [{ nome: { contains: busca } }, { codigo: { contains: busca } }]
            : undefined,
        },
        select: { id: true, nome: true, codigo: true, unidade: true },
        orderBy: [{ nome: "asc" }, { id: "asc" }],
        take,
      })
      return { opcoes: itens }
    }
    if (input.tipo === "fornecedores") {
      const itens = await tx.fornecedores.findMany({
        where: {
          AND: [
            fornecedorDaEmpresa(ctx.idEmpresa),
            busca
              ? {
                  OR: [
                    { razao_social: { contains: busca } },
                    { nome_fantasia: { contains: busca } },
                    { cnpj: { contains: busca } },
                  ],
                }
              : {},
          ],
        },
        select: {
          id: true,
          razao_social: true,
          nome_fantasia: true,
          cnpj: true,
        },
        orderBy: [{ razao_social: "asc" }, { id: "asc" }],
        take,
      })
      return {
        opcoes: itens.map((f) => ({
          id: f.id,
          nome: nomeFornecedor(f),
          codigo: f.cnpj,
          unidade: null,
        })),
      }
    }
    const modelo = input.tipo === "locais" ? tx.locais_estoque : tx.setores
    const itens = await (modelo as typeof tx.locais_estoque).findMany({
      where: {
        id_empresa: ctx.idEmpresa,
        status: "ATIVO",
        nome: busca ? { contains: busca } : undefined,
      },
      select: { id: true, nome: true },
      orderBy: [{ nome: "asc" }, { id: "asc" }],
      take,
    })
    return { opcoes: itens.map((l) => ({ ...l, codigo: null, unidade: null })) }
  })
}

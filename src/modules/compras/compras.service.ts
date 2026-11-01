import { randomUUID } from "node:crypto"
import "server-only"
import { Prisma } from "@/generated/prisma/client"
import {
  bloquearProdutoEstoque,
  prepararSaldoEstoque,
} from "@/modules/estoque/estoque.livro"
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
  ObservacaoForaDoLimite,
  excedeQuantidade,
  observacaoPedidoOrigem,
  observacaoRecebimento,
  paraEscala,
  proximoStatus,
  quantidadePendente,
  somarValores,
  situacaoRecebimento,
  somarQuantidades,
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
/**
 * Livro de recebimentos SEM alterar o banco: cada entrada gerada por um recebimento é uma linha de
 * movimentacao_estoque com origem_tipo = ORIGEM_RECEBIMENTO e origem_id = id da compra.
 * Quantidade recebida = soma dessas entradas; cada recebimento (etapa) é identificado por [rec:<chave>] na observação.
 */
const ORIGEM_RECEBIMENTO = "COMPRA_RECEBIMENTO"
const TOKEN_RECEBIMENTO = /\[rec:([A-Za-z0-9_-]+)\]/
type Recebido = Map<number, string> // idProduto → quantidade já recebida

type Movimento = {
  id: number
  id_produto: number
  quantidade: { toFixed(c: number): string }
  observacao: string | null
  data_movimentacao: Date
  usuarios: { id: number; nome: string }
  produtos: { codigo: string; nome: string }
}

/** Soma, por compra e produto, das entradas de recebimento (uma única consulta para qualquer quantidade de compras). */
async function recebidosPorCompra(
  tx: Transaction,
  idEmpresa: number,
  ids: number[],
) {
  const mapa = new Map<number, Recebido>()
  if (!ids.length) return mapa
  const linhas = await tx.movimentacao_estoque.groupBy({
    by: ["origem_id", "id_produto"],
    where: {
      id_empresa: idEmpresa,
      origem_tipo: ORIGEM_RECEBIMENTO,
      origem_id: { in: ids },
    },
    _sum: { quantidade: true },
  })
  for (const l of linhas) {
    if (l.origem_id === null) continue
    const porProduto = mapa.get(l.origem_id) ?? new Map<number, string>()
    porProduto.set(l.id_produto, l._sum.quantidade?.toFixed(3) ?? "0.000")
    mapa.set(l.origem_id, porProduto)
  }
  return mapa
}

/** Compras ENTREGUE do modelo antigo (sem entradas no livro) contam como integralmente recebidas. */
function recebidoEfetivo(
  compra: {
    status: string
    compra_itens: Array<{
      id_produto: number
      quantidade: { toFixed(c: number): string }
    }>
  },
  mapa: Recebido | undefined,
): Recebido {
  if (mapa?.size) return mapa
  if (compra.status === "ENTREGUE")
    return new Map(
      compra.compra_itens.map((i) => [i.id_produto, qtd(i.quantidade)]),
    )
  return new Map()
}

const compraAtiva = <T extends { status: string }>(c: T | null) =>
  c && c.status !== "CANCELADA" ? c : null

function validarObservacao(compor: () => string) {
  try {
    return compor()
  } catch (erro) {
    if (erro instanceof ObservacaoForaDoLimite)
      throw new ComprasError(400, erro.message)
    throw erro
  }
}
/**
 * uk_compra_pedido_legado permite UMA compra por pedido no banco e o schema não pode ser alterado aqui.
 * Ao cancelar, a compra solta o vínculo (id_pedido_compra_legado = NULL) e guarda o pedido de origem na observação;
 * a compra, os itens e a auditoria permanecem, e o pedido volta a poder gerar outra compra.
 */
const dadosSoltarPedido = (
  numeroPedido: string,
  observacao: string | null,
) => ({
  id_pedido_compra_legado: null,
  observacao: validarObservacao(() =>
    observacaoPedidoOrigem(numeroPedido, observacao),
  ),
})
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
    compra: compraAtiva(p.compras),
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
  const ativa = compraAtiva(p.compras)
  const livro = ativa
    ? (await recebidosPorCompra(tx, ctx.idEmpresa, [ativa.id])).get(ativa.id)
    : undefined
  return { ...p, recebidos: ativa ? recebidoEfetivo(ativa, livro) : new Map() }
}
function detalhePedido(p: Awaited<ReturnType<typeof carregarPedido>>) {
  // Recebido = entradas da compra ativa (compra cancelada não conta).
  const ativa = compraAtiva(p.compras)
  const recebidoPorProduto = p.recebidos
  return {
    ...apresentarPedido(p),
    compra: ativa
      ? { id: ativa.id, codigo: ativa.codigo, status: ativa.status }
      : null,
    itens: p.item_pedido_compra.map((i) => {
      const pedida = qtd(i.quantidade)
      const recebida = recebidoPorProduto.get(i.id_produto) ?? "0.000"
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
  const linhas = itens.map((i) => ({
    id_produto: i.idProduto,
    quantidade: i.quantidade,
    valor_unitario: i.valorUnitario,
    valor_total: totalItem(i.quantidade, i.valorUnitario), // calculado pelo sistema
  }))
  somarValores(linhas.map((l) => l.valor_total)) // lança ValorForaDoLimite (400) se não couber no banco
  return linhas
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
    if (acao === "emitir") await exigirFornecedor(tx, ctx, antes.fornecedor.id)
    if (acao === "cancelar") {
      if (antes.compra)
        throw conflito(
          "Cancele a compra vinculada (e suas notas) antes de cancelar o pedido.",
        )
      // Notas ativas ligadas direto ao pedido OU via compra do pedido impedem o cancelamento.
      const notasAtivas = await tx.nota_fiscal.count({
        where: {
          id_empresa: ctx.idEmpresa,
          status: { not: "CANCELADA" },
          OR: [
            { id_pedido_compra: id },
            { compras: { id_pedido_compra_legado: id } },
          ],
        },
      })
      if (notasAtivas)
        throw conflito(
          "O pedido possui nota fiscal ativa vinculada. Cancele a nota antes de cancelar o pedido.",
        )
    }
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
  compra_itens: {
    select: { id_produto: true, valor_total: true, quantidade: true },
  },
  _count: { select: { nota_fiscal: true } },
} satisfies Prisma.comprasInclude

function apresentarCompra(
  c: Prisma.comprasGetPayload<{ include: typeof incluirCompra }>,
  recebido: Recebido,
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
    recebimento: situacaoRecebimento(
      c.compra_itens.map((i) => ({
        pedida: qtd(i.quantidade),
        recebida: recebido.get(i.id_produto) ?? "0.000",
      })),
    ),
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
      pedido_compra: { select: { id: true, numero: true, status: true } },
      nota_fiscal: {
        select: { id: true, numero: true, serie: true, status: true },
        orderBy: { id: "asc" },
      },
    },
  })
  if (!c) throw new ComprasError(404, "Compra não encontrada.")
  const movimentos: Movimento[] = await tx.movimentacao_estoque.findMany({
    where: {
      id_empresa: ctx.idEmpresa,
      origem_tipo: ORIGEM_RECEBIMENTO,
      origem_id: id,
    },
    orderBy: { id: "asc" },
    include: {
      usuarios: { select: { id: true, nome: true } },
      produtos: { select: { codigo: true, nome: true } },
    },
  })
  return { ...c, movimentos }
}
/** Quantidades recebidas por produto, a partir do livro (movimentações da compra). */
function recebidoDaCompra(c: Awaited<ReturnType<typeof carregarCompra>>) {
  const livro: Recebido = new Map()
  for (const m of c.movimentos)
    livro.set(
      m.id_produto,
      somarQuantidades(livro.get(m.id_produto) ?? "0.000", qtd(m.quantidade)),
    )
  return recebidoEfetivo(c, livro)
}

/** Agrupa as movimentações em etapas de recebimento pelo token [rec:<chave>]. */
function historicoRecebimentos(movimentos: Movimento[]) {
  const etapas = new Map<
    string,
    {
      id: number
      data: string
      usuario: { id: number; nome: string }
      observacao: string | null
      itens: Array<{
        idProduto: number
        codigo: string
        nome: string
        quantidade: string
      }>
    }
  >()
  for (const m of movimentos) {
    const chave = TOKEN_RECEBIMENTO.exec(m.observacao ?? "")?.[1] ?? `m${m.id}`
    const texto =
      (m.observacao ?? "").replace(TOKEN_RECEBIMENTO, "").trim() || null
    const etapa = etapas.get(chave) ?? {
      id: m.id,
      data: m.data_movimentacao.toISOString(),
      usuario: m.usuarios,
      observacao: texto,
      itens: [],
    }
    etapa.itens.push({
      idProduto: m.id_produto,
      codigo: m.produtos.codigo,
      nome: m.produtos.nome,
      quantidade: qtd(m.quantidade),
    })
    etapas.set(chave, etapa)
  }
  return [...etapas.values()]
}

function detalheCompra(c: Awaited<ReturnType<typeof carregarCompra>>) {
  const recebido = recebidoDaCompra(c)
  return {
    ...apresentarCompra(c, recebido),
    pedido: c.pedido_compra
      ? { id: c.pedido_compra.id, numero: c.pedido_compra.numero }
      : null,
    itens: c.compra_itens.map((i) => {
      const pedida = qtd(i.quantidade) // quantidade comprada = referência do saldo
      const recebida = recebido.get(i.id_produto) ?? "0.000"
      return {
        id: i.id,
        idProduto: i.id_produto,
        codigo: i.produtos.codigo,
        nome: i.produtos.nome,
        unidade: i.produtos.unidade,
        quantidade: pedida,
        valorUnitario: dinheiro(i.valor_unitario),
        valorTotal: dinheiro(i.valor_total),
        quantidadePedida: pedida,
        quantidadeRecebida: recebida,
        quantidadePendente: quantidadePendente(pedida, recebida),
      }
    }),
    recebimentos: historicoRecebimentos(c.movimentos),
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
    const livro = await recebidosPorCompra(
      tx,
      ctx.idEmpresa,
      linhas.map((c) => c.id),
    )
    return {
      compras: linhas.map((c) =>
        apresentarCompra(c, recebidoEfetivo(c, livro.get(c.id))),
      ),
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
          compras: {
            select: { id: true, codigo: true, status: true, observacao: true },
          },
        },
      })
      if (!pedido)
        throw new ComprasError(400, "Pedido de compra não encontrado.")
      if (pedido.status !== "EMITIDO")
        throw conflito("Somente pedidos emitidos podem gerar uma compra.")
      // Compra CANCELADA não bloqueia: só uma compra ativa por pedido.
      const ativa = compraAtiva(pedido.compras)
      if (ativa)
        throw conflito(`O pedido já possui a compra ativa ${ativa.codigo}.`)
      // Cancelada de antes desta correção ainda ocupa o vínculo único do pedido: solta, mantendo o histórico.
      if (pedido.compras)
        await tx.compras.update({
          where: { id: pedido.compras.id },
          data: dadosSoltarPedido(pedido.numero, pedido.compras.observacao),
        })
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
    // Revalidar também a conversão de pedidos antigos, cuja associação pode ter sido inativada.
    await exigirFornecedor(tx, ctx, idFornecedor)
    somarValores(itens.map((i) => i.valor_total)) // limite do banco (400)
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

type CompraCarregada = Awaited<ReturnType<typeof carregarCompra>>

/** Entrada no estoque de UM item recebido (saldo, movimentação-livro e kardex), dentro da transação. */
async function entradaEstoque(
  tx: Transaction,
  ctx: Contexto,
  compra: CompraCarregada,
  item: CompraCarregada["compra_itens"][number],
  quantidade: string,
  idSetorInformado: number | null | undefined,
  observacao: string,
) {
  await bloquearProdutoEstoque(tx, ctx, item.id_produto)
  const existente = await tx.estoque.findFirst({
    where: {
      id_empresa: ctx.idEmpresa,
      id_local_estoque: compra.id_local_estoque,
      id_produto: item.id_produto,
    },
  })
  let idSetor: number
  if (existente) idSetor = existente.id_setor
  else {
    if (!idSetorInformado)
      throw new ComprasError(
        400,
        `Informe o setor de destino no estoque para ${item.produtos.nome}.`,
      )
    await exigirSetor(tx, ctx, idSetorInformado)
    const outro = await tx.estoque.findFirst({
      where: {
        id_empresa: ctx.idEmpresa,
        id_setor: idSetorInformado,
        id_produto: item.id_produto,
      },
      select: { id: true },
    })
    if (outro)
      throw conflito(
        `${item.produtos.nome} já possui saldo em outro local para este setor.`,
      )
    idSetor = idSetorInformado
  }
  const preparado = await prepararSaldoEstoque(
    tx,
    ctx,
    {
      idProduto: item.id_produto,
      idLocalEstoque: compra.id_local_estoque,
      idSetor,
    },
    existente,
  )
  const anterior = preparado.saldo.toFixed(3)
  const novo = somarQuantidades(anterior, quantidade)
  if (existente)
    await tx.estoque.update({
      where: { id: existente.id },
      data: { quantidade: novo, data_atualizacao: new Date() },
    })
  else
    await tx.estoque.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_local_estoque: compra.id_local_estoque,
        id_setor: idSetor,
        id_produto: item.id_produto,
        quantidade: novo,
      },
    })
  const mov = await tx.movimentacao_estoque.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_local_estoque: compra.id_local_estoque,
      id_setor: idSetor,
      id_produto: item.id_produto,
      tipo: "ENTRADA_NF",
      quantidade,
      valor_total: totalItem(quantidade, dinheiro(item.valor_unitario)),
      origem_tipo: ORIGEM_RECEBIMENTO,
      origem_id: compra.id,
      id_usuario: ctx.idUsuario,
      observacao,
    },
  })
  await tx.kardex.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_local_estoque: compra.id_local_estoque,
      id_setor: idSetor,
      id_produto: item.id_produto,
      id_movimentacao: mov.id,
      tipo_movimentacao: "ENTRADA",
      quantidade,
      saldo_anterior: anterior,
      saldo_atual: novo,
    },
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
    const chave = input.chaveIdempotencia ?? randomUUID()
    // Reenvio da mesma requisição: devolve o estado atual sem novo recebimento nem estoque.
    // (As gravações da empresa são serializadas, então a checagem não tem corrida.)
    if (
      input.chaveIdempotencia &&
      compra.movimentos.some(
        (m) => TOKEN_RECEBIMENTO.exec(m.observacao ?? "")?.[1] === chave,
      )
    )
      return { compra: antes, chave, repetido: true }
    if (!proximoStatus(transicoesCompra, "receber", antes.status))
      acaoInvalida("receber", antes.status)

    const recebido = recebidoDaCompra(compra)
    const pendentes = new Map(
      compra.compra_itens.map((item) => [
        item.id_produto,
        {
          item,
          pendente: quantidadePendente(
            qtd(item.quantidade),
            recebido.get(item.id_produto) ?? "0.000",
          ),
        },
      ]),
    )
    // Omitido = receber todo o saldo pendente; informado = quantidades da etapa.
    const solicitados: Array<{ idProduto: number; quantidade: string }> =
      input.itens ??
      [...pendentes]
        .filter(([, v]) => (paraEscala(v.pendente, 3) ?? BigInt(0)) > BigInt(0))
        .map(([idProduto, v]) => ({ idProduto, quantidade: v.pendente }))
    if (!solicitados.length)
      throw conflito("Não há quantidades pendentes para receber nesta compra.")
    for (const s of solicitados) {
      const alvo = pendentes.get(s.idProduto)
      if (!alvo)
        throw new ComprasError(
          400,
          "Há item de recebimento que não pertence à compra.",
        )
      if (excedeQuantidade(alvo.pendente, s.quantidade))
        throw new ComprasError(
          400,
          `A quantidade recebida de ${alvo.item.produtos.nome} excede o saldo pendente (${alvo.pendente}).`,
        )
    }

    const observacao = validarObservacao(() =>
      observacaoRecebimento(compra.codigo, chave, input.observacao),
    )
    for (const s of solicitados)
      await entradaEstoque(
        tx,
        ctx,
        compra,
        pendentes.get(s.idProduto)!.item,
        s.quantidade,
        input.idSetorDestino,
        observacao,
      )

    // Encerra a compra somente quando não resta saldo pendente em nenhum item.
    const situacao = situacaoRecebimento(
      compra.compra_itens.map((item) => {
        const feito = solicitados.find((s) => s.idProduto === item.id_produto)
        const base = recebido.get(item.id_produto) ?? "0.000"
        return {
          pedida: qtd(item.quantidade),
          recebida: feito ? somarQuantidades(base, feito.quantidade) : base,
        }
      }),
    )
    const r = await tx.compras.updateMany({
      where: { id, id_empresa: ctx.idEmpresa, status: "EMITIDA" },
      data: {
        status: situacao === "TOTAL" ? "ENTREGUE" : "EMITIDA",
        data_atualizacao: new Date(),
      },
    })
    if (r.count !== 1)
      throw conflito("A compra foi alterada por outra operação.")
    if (compra.pedido_compra)
      await tx.pedido_compra.updateMany({
        where: {
          id: compra.pedido_compra.id,
          id_empresa: ctx.idEmpresa,
          status: { in: ["EMITIDO", "PARCIAL"] },
        },
        data: { status: situacao === "TOTAL" ? "RECEBIDO" : "PARCIAL" },
      })
    const depois = detalheCompra(await carregarCompra(tx, ctx, id))
    await auditar(tx, ctx, "compras", id, antes, depois)
    return { compra: depois, chave, repetido: false }
  })
}

export function acaoCompra(ctx: Contexto, id: number, acao: string) {
  return gravacao(ctx, async (tx) => {
    const antes = detalheCompra(await carregarCompra(tx, ctx, id))
    const novo = proximoStatus(transicoesCompra, acao, antes.status)
    if (!novo) acaoInvalida(acao, antes.status)
    if (novo === "CANCELADA") {
      if (antes.recebimentos.length)
        throw conflito(
          "Compra com recebimentos registrados não pode ser cancelada: o estoque já recebeu entradas.",
        )
      if (antes.notas.some((n) => n.status !== "CANCELADA"))
        throw conflito(
          "Cancele as notas fiscais vinculadas antes de cancelar a compra.",
        )
    }
    const dadosVinculo =
      novo === "CANCELADA" && antes.pedido
        ? dadosSoltarPedido(antes.pedido.numero, antes.observacao)
        : {}
    const r = await tx.compras.updateMany({
      where: { id, id_empresa: ctx.idEmpresa, status: antes.status },
      data: {
        status: novo,
        data_atualizacao: new Date(),
        // Cancelada libera o pedido para gerar outra compra (ver dadosSoltarPedido).
        ...dadosVinculo,
      },
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
    const { skip, take } = paginar(input.pagina, input.limite)
    // Ordenação estável (nome, id) + skip/take: páginas sucessivas não repetem registros.
    const resposta = <T>(opcoes: T[], total: number) => ({
      opcoes,
      paginacao: {
        ...paginacao(input.pagina, input.limite, total),
        temMais: skip + opcoes.length < total,
      },
    })
    if (input.tipo === "insumos") {
      const where: Prisma.produtosWhereInput = {
        ...insumoDaEmpresa(ctx.idEmpresa),
        OR: busca
          ? [{ nome: { contains: busca } }, { codigo: { contains: busca } }]
          : undefined,
      }
      const [total, itens] = await Promise.all([
        tx.produtos.count({ where }),
        tx.produtos.findMany({
          where,
          select: { id: true, nome: true, codigo: true, unidade: true },
          orderBy: [{ nome: "asc" }, { id: "asc" }],
          skip,
          take,
        }),
      ])
      return resposta(itens, total)
    }
    if (input.tipo === "fornecedores") {
      const where: Prisma.fornecedoresWhereInput = {
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
      }
      const [total, itens] = await Promise.all([
        tx.fornecedores.count({ where }),
        tx.fornecedores.findMany({
          where,
          select: {
            id: true,
            id_empresa: true,
            razao_social: true,
            nome_fantasia: true,
            cnpj: true,
            empresa_fornecedor: {
              where: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
              select: {
                prazo_pagamento: true,
                prazo_entrega: true,
                observacao: true,
              },
            },
          },
          orderBy: [{ razao_social: "asc" }, { id: "asc" }],
          skip,
          take,
        }),
      ])
      return resposta(
        itens.map((f) => ({
          id: f.id,
          nome: nomeFornecedor(f),
          codigo: f.cnpj,
          unidade: null,
          tipoFornecedor:
            f.id_empresa === null ? "GLOBAL_ASSOCIADO" : "ESPECIFICO",
          condicoesComerciais:
            f.id_empresa === null ? (f.empresa_fornecedor[0] ?? null) : null,
        })),
        total,
      )
    }
    if (input.tipo === "pedidos") {
      const where: Prisma.pedido_compraWhereInput = {
        id_empresa: ctx.idEmpresa,
        id_fornecedor: input.idFornecedor,
        status: input.status as Prisma.pedido_compraWhereInput["status"],
        // Seletor para gerar compra: só pedidos sem compra ativa.
        // Sem compra ativa: nenhuma compra ou só uma cancelada (vínculo antigo).
        AND:
          input.ativas === "false"
            ? [
                {
                  OR: [
                    { compras: { is: null } },
                    { compras: { status: "CANCELADA" } },
                  ],
                },
              ]
            : undefined,
        OR: busca
          ? [
              { numero: { contains: busca } },
              { fornecedores: { razao_social: { contains: busca } } },
              { fornecedores: { nome_fantasia: { contains: busca } } },
            ]
          : undefined,
      }
      const [total, itens] = await Promise.all([
        tx.pedido_compra.count({ where }),
        tx.pedido_compra.findMany({
          where,
          select: {
            id: true,
            numero: true,
            fornecedores: {
              select: { razao_social: true, nome_fantasia: true },
            },
          },
          orderBy: [{ id: "desc" }],
          skip,
          take,
        }),
      ])
      return resposta(
        itens.map((p) => ({
          id: p.id,
          nome: p.numero,
          codigo: nomeFornecedor(p.fornecedores),
          unidade: null,
        })),
        total,
      )
    }
    if (input.tipo === "compras") {
      const where: Prisma.comprasWhereInput = {
        id_empresa: ctx.idEmpresa,
        id_fornecedor: input.idFornecedor,
        status:
          input.ativas === "true"
            ? { not: "CANCELADA" }
            : (input.status as Prisma.comprasWhereInput["status"]),
        OR: busca
          ? [
              { codigo: { contains: busca } },
              { fornecedores: { razao_social: { contains: busca } } },
              { fornecedores: { nome_fantasia: { contains: busca } } },
            ]
          : undefined,
      }
      const [total, itens] = await Promise.all([
        tx.compras.count({ where }),
        tx.compras.findMany({
          where,
          select: {
            id: true,
            codigo: true,
            fornecedores: {
              select: { razao_social: true, nome_fantasia: true },
            },
            compra_itens: { select: { valor_total: true } },
          },
          orderBy: [{ id: "desc" }],
          skip,
          take,
        }),
      ])
      return resposta(
        itens.map((c) => ({
          id: c.id,
          nome: c.codigo,
          codigo: nomeFornecedor(c.fornecedores),
          unidade: null,
          valorTotal: somarValores(
            c.compra_itens.map((i) => dinheiro(i.valor_total)),
          ),
        })),
        total,
      )
    }
    const modelo = input.tipo === "locais" ? tx.locais_estoque : tx.setores
    const where = {
      id_empresa: ctx.idEmpresa,
      status: "ATIVO" as const,
      nome: busca ? { contains: busca } : undefined,
    }
    const [total, itens] = await Promise.all([
      (modelo as typeof tx.locais_estoque).count({ where }),
      (modelo as typeof tx.locais_estoque).findMany({
        where,
        select: { id: true, nome: true },
        orderBy: [{ nome: "asc" }, { id: "asc" }],
        skip,
        take,
      }),
    ])
    return resposta(
      itens.map((l) => ({ ...l, codigo: null, unidade: null })),
      total,
    )
  })
}

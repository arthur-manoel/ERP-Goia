import "server-only"
import { createHash } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import type { Contexto } from "./pedidos.authorization"
import { PedidoError } from "./pedidos.error"
import { dataCivil, subtotal, total } from "./pedidos.calculo"
import {
  MAX_ITENS,
  type CriarInput,
  type ItemInput,
  type EditarInput,
  type EditarItemInput,
  type ListarInput,
} from "./pedidos.schema"
import * as repo from "./pedidos.repository"

async function validarCliente(tx: repo.Transaction, ctx: Contexto, id: number) {
  const cliente = await tx.clientes.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
  })
  if (!cliente) throw new PedidoError(404, "Cadastro não encontrado.")
  if (cliente.status !== "ATIVO")
    throw new PedidoError(409, "Cliente não está ativo.")
}
async function prepararItens(
  tx: repo.Transaction,
  ctx: Contexto,
  itens: ItemInput[],
) {
  const catalogo = await tx.produto_empresa.findMany({
    where: {
      id_empresa: ctx.idEmpresa,
      id_produto: { in: [...new Set(itens.map((i) => i.idProduto))] },
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
  const produtos = new Map(catalogo.map((p) => [p.id_produto, p]))
  return itens.map((item) => {
    const vinculo = produtos.get(item.idProduto)
    if (!vinculo) throw new PedidoError(404, "Cadastro não encontrado.")
    const produto = vinculo.produtos
    if (
      vinculo.status !== "ATIVO" ||
      produto.status !== "ATIVO" ||
      !produto.permite_venda
    )
      throw new PedidoError(
        409,
        "Produto não está ativo e habilitado para venda.",
      )
    const variacoes = produto.produto_variacoes
    const temGrade =
      vinculo.id_cor !== null ||
      vinculo.id_tamanho !== null ||
      variacoes.some((v) => v.id_cor !== null || v.id_tamanho !== null)
    const variacao =
      item.idVariacao === null
        ? null
        : variacoes.find((v) => v.id === item.idVariacao)
    if (item.idVariacao !== null && !variacao)
      throw new PedidoError(404, "Cadastro não encontrado.")
    if (temGrade && !variacao)
      throw new PedidoError(
        409,
        "Informe uma variação válida para o produto com grade.",
      )
    if (variacao) {
      if (
        (variacao.cores &&
          variacao.cores.id_empresa !== null &&
          variacao.cores.id_empresa !== ctx.idEmpresa) ||
        (variacao.tamanhos && variacao.tamanhos.id_empresa !== ctx.idEmpresa)
      )
        throw new PedidoError(404, "Cadastro não encontrado.")
      if (
        variacao.status !== "ATIVO" ||
        (variacao.cores && variacao.cores.status !== "ATIVA") ||
        (variacao.tamanhos && variacao.tamanhos.status !== "ATIVO")
      )
        throw new PedidoError(409, "Variação, cor ou tamanho não está ativo.")
    }
    return {
      id_produto: produto.id,
      id_variacao: variacao?.id ?? null,
      id_cor: variacao?.id_cor ?? null,
      id_tamanho: variacao?.id_tamanho ?? null,
      codigo_produto: vinculo.codigo_interno ?? produto.codigo,
      descricao: produto.nome,
      unidade: produto.unidade,
      quantidade: new Prisma.Decimal(item.quantidade),
      valor_unitario: new Prisma.Decimal(item.precoPraticado),
      valor_total: subtotal(item.quantidade, item.precoPraticado),
    }
  })
}
function hash(input: CriarInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}
const referencia = (pedido: repo.Pedido) => ({
  idPedido: pedido.id,
  versao: pedido.versao,
})
export async function criarPedido(
  ctx: Contexto,
  input: CriarInput,
  chave: string,
) {
  return repo.gravacao(async (tx) => {
    await repo.bloquearEmpresa(tx, ctx.idEmpresa)
    const existente = await tx.pedido_cliente.findUnique({
      where: {
        id_empresa_chave_idempotencia: {
          id_empresa: ctx.idEmpresa,
          chave_idempotencia: chave,
        },
      },
    })
    const conteudo = hash(input)
    if (existente) {
      if (
        existente.hash_requisicao !== conteudo ||
        existente.id_usuario !== ctx.idUsuario
      )
        throw new PedidoError(
          409,
          "Chave de idempotência já utilizada por outra requisição.",
        )
      return {
        idPedido: existente.id,
        numero: existente.numero,
        versao: existente.versao,
        criado: false,
      }
    }
    await validarCliente(tx, ctx, input.idCliente)
    const itens = await prepararItens(tx, ctx, input.itens)
    const calculado = total(itens.map((i) => i.valor_total))
    const numero = await repo.proximoNumero(tx, ctx.idEmpresa)
    const pedido = await tx.pedido_cliente.create({
      data: {
        id_empresa: ctx.idEmpresa,
        id_usuario: ctx.idUsuario,
        id_cliente: input.idCliente,
        numero,
        status: "RASCUNHO",
        data_previsao_entrega: dataCivil(input.dataEntregaPrevista),
        observacao: input.observacao,
        valor_subtotal: calculado.subtotal,
        valor_total: calculado.total,
        chave_idempotencia: chave,
        hash_requisicao: conteudo,
      },
    })
    await tx.pedido_cliente_item.createMany({
      data: itens.map((item, i) => ({
        ...item,
        id_pedido_cliente: pedido.id,
        numero_item: i + 1,
      })),
    })
    await tx.pedido_cliente_historico.create({
      data: {
        id_pedido_cliente: pedido.id,
        id_usuario: ctx.idUsuario,
        status_novo: "RASCUNHO",
        observacao: "Pedido criado pela API.",
      },
    })
    const depois = await repo.buscarPedido(tx, ctx, pedido.id)
    await repo.auditar(tx, ctx, null, depois)
    return { ...referencia(depois), numero, criado: true }
  }, true)
}
export const consultarPedido = (ctx: Contexto, id: number) =>
  repo.leitura(async (tx) => repo.dto(await repo.buscarPedido(tx, ctx, id)))
export const listarPedidos = (ctx: Contexto, input: ListarInput) =>
  repo.leitura((tx) => repo.listar(tx, ctx, input))
export async function editarPedido(
  ctx: Contexto,
  id: number,
  versao: number,
  input: EditarInput,
) {
  return repo.gravacao(async (tx) => {
    const antes = await repo.bloquearRascunho(tx, ctx, id, versao)
    await validarCliente(tx, ctx, input.idCliente ?? antes.id_cliente)
    if (input.idCliente !== undefined) {
      // Endereço e condições legados são do cliente original; nunca reapontá-los implicitamente.
      if (
        input.idCliente !== antes.id_cliente &&
        (antes.id_endereco_entrega !== null ||
          antes.id_condicao_pagamento !== null)
      )
        throw new PedidoError(
          409,
          "Pedido possui endereço ou condição comercial vinculada; troca de cliente requer revisão.",
        )
    }
    const depois = await repo.recalcular(tx, ctx, antes, {
      id_cliente: input.idCliente,
      data_previsao_entrega:
        input.dataEntregaPrevista === undefined
          ? undefined
          : dataCivil(input.dataEntregaPrevista),
      observacao: input.observacao,
    })
    await repo.auditar(tx, ctx, antes, depois)
    return referencia(depois)
  })
}
async function garantirItemUnico(
  tx: repo.Transaction,
  idPedido: number,
  input: ItemInput,
  idItem?: number,
) {
  const duplicado = await tx.pedido_cliente_item.findFirst({
    where: {
      id_pedido_cliente: idPedido,
      id_produto: input.idProduto,
      id_variacao: input.idVariacao,
      id: idItem === undefined ? undefined : { not: idItem },
    },
  })
  if (duplicado)
    throw new PedidoError(409, "Produto/variação já está no pedido.")
}
export async function incluirItem(
  ctx: Contexto,
  id: number,
  versao: number,
  input: ItemInput,
) {
  return repo.gravacao(async (tx) => {
    const antes = await repo.bloquearRascunho(tx, ctx, id, versao)
    if (antes.pedido_cliente_item.length >= MAX_ITENS)
      throw new PedidoError(409, "Pedido atingiu o limite de itens.")
    await validarCliente(tx, ctx, antes.id_cliente)
    await garantirItemUnico(tx, id, input)
    const [dados] = await prepararItens(tx, ctx, [input])
    const maior = antes.pedido_cliente_item.reduce(
      (n, i) => Math.max(n, i.numero_item),
      0,
    )
    if (maior >= 2147483647)
      throw new PedidoError(409, "Numeração de itens esgotada.")
    const item = await tx.pedido_cliente_item.create({
      data: { ...dados, id_pedido_cliente: id, numero_item: maior + 1 },
    })
    const depois = await repo.recalcular(tx, ctx, antes)
    await repo.auditar(tx, ctx, antes, depois)
    return { ...referencia(depois), idItem: item.id }
  })
}
export async function editarItem(
  ctx: Contexto,
  id: number,
  idItem: number,
  versao: number,
  input: EditarItemInput,
) {
  return repo.gravacao(async (tx) => {
    const antes = await repo.bloquearRascunho(tx, ctx, id, versao)
    const item = antes.pedido_cliente_item.find((i) => i.id === idItem)
    if (!item) throw new PedidoError(404, "Item não encontrado.")
    await validarCliente(tx, ctx, antes.id_cliente)
    const dados = {
      idProduto: input.idProduto ?? item.id_produto,
      idVariacao:
        input.idVariacao === undefined ? item.id_variacao : input.idVariacao,
      quantidade: input.quantidade ?? item.quantidade.toFixed(3),
      precoPraticado: input.precoPraticado ?? item.valor_unitario.toFixed(2),
    }
    await garantirItemUnico(tx, id, dados, idItem)
    const [catalogo] = await prepararItens(tx, ctx, [dados])
    const mudaReferencia =
      dados.idProduto !== item.id_produto ||
      dados.idVariacao !== item.id_variacao
    const valor = subtotal(
      dados.quantidade,
      dados.precoPraticado,
      item.valor_desconto.toFixed(2),
      item.valor_acrescimo.toFixed(2),
    )
    await tx.pedido_cliente_item.update({
      where: { id: idItem },
      data: {
        ...(mudaReferencia
          ? catalogo
          : {
              quantidade: catalogo.quantidade,
              valor_unitario: catalogo.valor_unitario,
            }),
        valor_total: valor,
      },
    })
    const depois = await repo.recalcular(tx, ctx, antes)
    await repo.auditar(tx, ctx, antes, depois)
    return { ...referencia(depois), idItem }
  })
}
export async function removerItem(
  ctx: Contexto,
  id: number,
  idItem: number,
  versao: number,
) {
  return repo.gravacao(async (tx) => {
    const antes = await repo.bloquearRascunho(tx, ctx, id, versao)
    if (!antes.pedido_cliente_item.some((i) => i.id === idItem))
      throw new PedidoError(404, "Item não encontrado.")
    await validarCliente(tx, ctx, antes.id_cliente)
    if (antes.pedido_cliente_item.length <= 1)
      throw new PedidoError(409, "Não é permitido remover o último item.")
    await tx.pedido_cliente_item.delete({ where: { id: idItem } })
    const depois = await repo.recalcular(tx, ctx, antes)
    await repo.auditar(tx, ctx, antes, depois)
    return { ...referencia(depois), idItem, removido: true }
  })
}

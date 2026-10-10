import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { Contexto } from "./pedidos.authorization"
import type { ListarInput } from "./pedidos.schema"
import { PedidoError } from "./pedidos.error"
import { disputaPersistencia } from "@/lib/prisma-concorrencia"
import { dataCivil, subtotal, total } from "./pedidos.calculo"

export type Transaction = Prisma.TransactionClient
const include = {
  pedido_cliente_item: {
    orderBy: [{ numero_item: "asc" as const }, { id: "asc" as const }],
    include: {
      produto_variacoes: { select: { id_empresa: true, id_produto: true } },
      _count: {
        select: {
          item_venda: true,
          ordem_producao_item: true,
          pedido_cliente_entrega_item: true,
        },
      },
    },
  },
  _count: {
    select: { venda: true, ordem_producao: true, pedido_cliente_entrega: true },
  },
} satisfies Prisma.pedido_clienteInclude
export type Pedido = Prisma.pedido_clienteGetPayload<{
  include: typeof include
}>

export async function gravacao<T>(
  operation: (tx: Transaction) => Promise<T>,
  repetir = false,
): Promise<T> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
        timeout: 15000,
      })
    } catch (error) {
      if (disputaPersistencia(error)) {
        if (repetir && tentativa < 4) {
          await new Promise((resolve) =>
            setTimeout(resolve, (tentativa + 1) * 15),
          )
          continue
        }
        throw new PedidoError(
          409,
          "Conflito concorrente. Consulte o pedido e tente novamente.",
        )
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2003", "P2025"].includes(error.code)
      )
        throw new PedidoError(
          409,
          "Os vínculos foram alterados ou impedem a operação.",
        )
      throw error
    }
  }
  throw new PedidoError(409, "Conflito concorrente.")
}
export const leitura = <T>(operation: (tx: Transaction) => Promise<T>) =>
  prisma.$transaction(operation, {
    isolationLevel: "RepeatableRead",
    timeout: 15000,
  })
export async function buscarPedido(
  tx: Transaction,
  ctx: Contexto,
  id: number,
): Promise<Pedido> {
  const pedido = await tx.pedido_cliente.findFirst({
    where: {
      id,
      id_empresa: ctx.idEmpresa,
      clientes: { id_empresa: ctx.idEmpresa },
    },
    include,
  })
  if (
    !pedido ||
    pedido.pedido_cliente_item.some(
      (i) =>
        i.produto_variacoes &&
        (i.produto_variacoes.id_empresa !== ctx.idEmpresa ||
          i.produto_variacoes.id_produto !== i.id_produto),
    )
  )
    throw new PedidoError(404, "Pedido não encontrado.")
  return pedido
}
export async function bloquearRascunho(
  tx: Transaction,
  ctx: Contexto,
  id: number,
  versao: number,
) {
  const linhas = await tx.$queryRaw<
    Array<{ id: number; status: string; versao: number }>
  >`
    SELECT id, status, versao FROM pedido_cliente WHERE id = ${id} AND id_empresa = ${ctx.idEmpresa} FOR UPDATE
  `
  if (!linhas.length) throw new PedidoError(404, "Pedido não encontrado.")
  if (linhas[0].status !== "RASCUNHO" || linhas[0].versao !== versao)
    throw new PedidoError(
      409,
      "Pedido não está em rascunho ou foi alterado. Consulte a versão atual.",
    )
  const pedido = await buscarPedido(tx, ctx, id)
  if (
    Object.values(pedido._count).some((v) => v > 0) ||
    pedido.pedido_cliente_item.some((i) =>
      Object.values(i._count).some((v) => v > 0),
    )
  )
    throw new PedidoError(
      409,
      "Pedido já possui operação vinculada e não pode ser editado por este fluxo.",
    )
  return pedido
}
export async function bloquearEmpresa(tx: Transaction, idEmpresa: number) {
  const empresas = await tx.$queryRaw<
    Array<{ id: number }>
  >`SELECT id FROM empresas WHERE id = ${idEmpresa} AND status = 'ATIVA' FOR UPDATE`
  if (!empresas.length) throw new PedidoError(403, "Acesso negado à empresa.")
}
export async function proximoNumero(tx: Transaction, idEmpresa: number) {
  // Criação já mantém o lock da empresa, inclusive antes de ler a idempotência.
  const sequencia = await tx.sequencias_automaticas.upsert({
    where: {
      id_empresa_entidade: {
        id_empresa: idEmpresa,
        entidade: "pedido_cliente",
      },
    },
    create: {
      id_empresa: idEmpresa,
      entidade: "pedido_cliente",
      ultimo_numero: BigInt(0),
    },
    update: {},
  })
  const legados = await tx.$queryRaw<Array<{ maior: string | null }>>`
    SELECT CAST(MAX(CAST(numero AS UNSIGNED)) AS CHAR) AS maior FROM pedido_cliente
    WHERE id_empresa = ${idEmpresa} AND numero REGEXP '^[1-9][0-9]{0,19}$'
  `
  const maior = BigInt(legados[0]?.maior ?? "0")
  const ultimo =
    sequencia.ultimo_numero > maior ? sequencia.ultimo_numero : maior
  if (ultimo >= BigInt("18446744073709551615"))
    throw new PedidoError(409, "Numeração esgotada.")
  const numero = ultimo + BigInt(1)
  await tx.sequencias_automaticas.update({
    where: {
      id_empresa_entidade: {
        id_empresa: idEmpresa,
        entidade: "pedido_cliente",
      },
    },
    data: { ultimo_numero: numero },
  })
  return numero.toString()
}
export async function recalcular(
  tx: Transaction,
  ctx: Contexto,
  antes: Pedido,
  data: Prisma.pedido_clienteUncheckedUpdateManyInput = {},
) {
  const itens = await tx.pedido_cliente_item.findMany({
    where: { id_pedido_cliente: antes.id },
    orderBy: { id: "asc" },
  })
  if (!itens.length)
    throw new PedidoError(409, "Pedido deve manter ao menos um item.")
  const subtotais = []
  for (const item of itens) {
    if (item.quantidade.lte(0))
      throw new PedidoError(
        409,
        "Quantidade legada incompatível; requer revisão.",
      )
    const valor = subtotal(
      item.quantidade.toFixed(3),
      item.valor_unitario.toFixed(2),
      item.valor_desconto.toFixed(2),
      item.valor_acrescimo.toFixed(2),
    )
    subtotais.push(valor)
    if (!valor.eq(item.valor_total))
      await tx.pedido_cliente_item.update({
        where: { id: item.id },
        data: { valor_total: valor },
      })
  }
  const calculado = total(
    subtotais,
    antes.valor_desconto.toFixed(2),
    antes.valor_frete.toFixed(2),
    antes.valor_acrescimo.toFixed(2),
  )
  if (antes.versao >= 2147483647)
    throw new PedidoError(409, "Versão do pedido esgotada.")
  const resultado = await tx.pedido_cliente.updateMany({
    where: {
      id: antes.id,
      id_empresa: ctx.idEmpresa,
      versao: antes.versao,
      status: "RASCUNHO",
    },
    data: {
      ...data,
      valor_subtotal: calculado.subtotal,
      valor_total: calculado.total,
      versao: { increment: 1 },
    },
  })
  if (resultado.count !== 1)
    throw new PedidoError(409, "Pedido foi alterado por outra operação.")
  return buscarPedido(tx, ctx, antes.id)
}
export async function auditar(
  tx: Transaction,
  ctx: Contexto,
  antes: Pedido | null,
  depois: Pedido,
) {
  await tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela: "pedido_cliente",
      id_registro: depois.id,
      acao: antes ? "UPDATE" : "INSERT",
      dados_anteriores: antes ? JSON.stringify(dto(antes)) : null,
      dados_novos: JSON.stringify(dto(depois)),
    },
  })
}
export async function listar(
  tx: Transaction,
  ctx: Contexto,
  input: ListarInput,
) {
  const where: Prisma.pedido_clienteWhereInput = {
    id_empresa: ctx.idEmpresa,
    clientes: { id_empresa: ctx.idEmpresa },
    id_cliente: input.idCliente,
    status: input.status,
    data_pedido: {
      gte: input.dataInicio ? dataCivil(input.dataInicio) : undefined,
      lte: input.dataFim
        ? new Date(input.dataFim + "T23:59:59.999Z")
        : undefined,
    },
    OR: input.busca
      ? [
          { numero: { contains: input.busca.replace(/[\\%_]/g, "\\$&") } },
          {
            clientes: {
              nome_razao_social: {
                contains: input.busca.replace(/[\\%_]/g, "\\$&"),
              },
            },
          },
        ]
      : undefined,
  }
  const totalRegistros = await tx.pedido_cliente.count({ where })
  const pedidos = await tx.pedido_cliente.findMany({
    where,
    orderBy: [{ data_pedido: "desc" }, { id: "desc" }],
    skip: (input.pagina - 1) * input.limite,
    take: input.limite,
    select: {
      id: true,
      numero: true,
      id_cliente: true,
      status: true,
      versao: true,
      data_pedido: true,
      data_previsao_entrega: true,
      valor_total: true,
    },
  })
  return {
    dados: pedidos.map((p) => ({
      idPedido: p.id,
      numero: p.numero,
      idCliente: p.id_cliente,
      status: p.status,
      versao: p.versao,
      criadoEm: p.data_pedido.toISOString(),
      dataEntregaPrevista:
        p.data_previsao_entrega?.toISOString().slice(0, 10) ?? null,
      total: p.valor_total.toFixed(2),
    })),
    paginacao: {
      pagina: input.pagina,
      limite: input.limite,
      totalRegistros,
      totalPaginas: Math.ceil(totalRegistros / input.limite),
    },
  }
}
export function dto(p: Pedido) {
  return {
    idPedido: p.id,
    numero: p.numero,
    idCliente: p.id_cliente,
    status: p.status,
    versao: p.versao,
    dataEntregaPrevista:
      p.data_previsao_entrega?.toISOString().slice(0, 10) ?? null,
    criadoEm: p.data_pedido.toISOString(),
    atualizadoEm: p.data_atualizacao.toISOString(),
    observacao: p.observacao,
    subtotal: p.valor_subtotal.toFixed(2),
    desconto: p.valor_desconto.toFixed(2),
    frete: p.valor_frete.toFixed(2),
    acrescimo: p.valor_acrescimo.toFixed(2),
    total: p.valor_total.toFixed(2),
    itens: p.pedido_cliente_item.map((i) => ({
      idItem: i.id,
      numeroItem: i.numero_item,
      idProduto: i.id_produto,
      idVariacao: i.id_variacao,
      idCor: i.id_cor,
      idTamanho: i.id_tamanho,
      codigoProduto: i.codigo_produto,
      descricao: i.descricao,
      unidade: i.unidade,
      quantidade: i.quantidade.toFixed(3),
      precoPraticado: i.valor_unitario.toFixed(2),
      desconto: i.valor_desconto.toFixed(2),
      acrescimo: i.valor_acrescimo.toFixed(2),
      subtotal: i.valor_total.toFixed(2),
    })),
  }
}

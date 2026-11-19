import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { movimentarNaTransacao } from "@/modules/movimentacoes-estoque/movimentacoes-estoque.repository"
import { variacaoAtivaNaEmpresa } from "@/modules/estoque/estoque.grade"
import { chaveMovimento } from "@/modules/reservas/operacoes"
import {
  ComprasError,
  auditar,
  type Contexto,
  type Transaction,
} from "./compras.repository"
import {
  ObservacaoForaDoLimite,
  observacaoRecebimento,
  totalItem,
} from "./compras.regras"
const falha = (texto: string): never => {
  throw new ComprasError(409, texto)
}
export const ORIGEM_COMPRA = "COMPRA_RECEBIMENTO"
export type SolicitacaoRecebimento = {
  idItemCompra?: number
  idProduto?: number
  idVariacao?: number
  quantidade: string
  idSetorDestino?: number | null
}
export async function carregarFisico(
  tx: Transaction,
  ctx: Pick<Contexto, "idEmpresa">,
  id: number,
) {
  const compra = await tx.compras.findFirst({
    where: { id, id_empresa: ctx.idEmpresa },
    include: {
      compra_itens: {
        orderBy: { id: "asc" },
        include: { produtos: { select: { nome: true, unidade: true } } },
      },
      pedido_compra: true,
    },
  })
  if (!compra) throw new ComprasError(404, "Compra não encontrada.")
  const movimentos = await tx.movimentacao_estoque.findMany({
    where: {
      id_empresa: ctx.idEmpresa,
      origem_tipo: ORIGEM_COMPRA,
      origem_id: id,
    },
    orderBy: { id: "asc" },
    include: { compra_recebimento_linha: true, produto_variacoes: true },
  })
  const recebidos = new Map<number, Prisma.Decimal>()
  const pendencias: string[] = []
  const porMovimento = new Map<number, number>()
  for (const m of movimentos) {
    const vinculo = m.compra_recebimento_linha
    const candidatos = compra.compra_itens.filter(
      (i) =>
        i.id_produto === m.id_produto &&
        ((!i.id_cor && !i.id_tamanho) ||
          (i.id_cor === (m.produto_variacoes?.id_cor ?? null) &&
            i.id_tamanho === (m.produto_variacoes?.id_tamanho ?? null))),
    )
    const alvo = vinculo
      ? compra.compra_itens.find((i) => i.id === vinculo.id_compra_item)
      : candidatos.length === 1
        ? candidatos[0]
        : undefined
    if (m.tipo !== "ENTRADA_NF" || !m.quantidade.gt(0) || !alvo) {
      pendencias.push(
        `Movimento ${m.id} sem vínculo físico inequívoco com um item da compra.`,
      )
      continue
    }
    if (
      vinculo &&
      (vinculo.id_compra !== id ||
        vinculo.id_empresa !== ctx.idEmpresa ||
        vinculo.id_produto !== m.id_produto ||
        !vinculo.quantidade.eq(m.quantidade))
    )
      falha("Vínculo de recebimento divergente do livro.")
    porMovimento.set(m.id, alvo.id)
    recebidos.set(
      alvo.id,
      (recebidos.get(alvo.id) ?? new Prisma.Decimal(0)).plus(m.quantidade),
    )
  }
  for (const i of compra.compra_itens)
    if ((recebidos.get(i.id) ?? new Prisma.Decimal(0)).gt(i.quantidade))
      pendencias.push(
        `O item ${i.id} possui recebimentos acima da quantidade comprada.`,
      )
  if (
    compra.status === "ENTREGUE" &&
    !compra.compra_itens.every((i) =>
      (recebidos.get(i.id) ?? new Prisma.Decimal(0)).eq(i.quantidade),
    )
  )
    pendencias.push(
      "Compra antiga marcada como entregue sem comprovação no livro. Regularização necessária.",
    )
  return { compra, movimentos, recebidos, porMovimento, pendencias }
}
export type Fisico = Awaited<ReturnType<typeof carregarFisico>>
export async function variacaoDoItem(
  tx: Transaction,
  ctx: Pick<Contexto, "idEmpresa">,
  item: Fisico["compra"]["compra_itens"][number],
  informada?: number | null,
) {
  const variacoes = await tx.produto_variacoes.findMany({
    where: { id_empresa: ctx.idEmpresa, id_produto: item.id_produto },
    include: { cores: true, tamanhos: true },
  })
  const variacao = informada
    ? variacoes.find((v) => v.id === informada)
    : item.id_cor || item.id_tamanho
      ? variacoes.find(
          (v) => v.id_cor === item.id_cor && v.id_tamanho === item.id_tamanho,
        )
      : undefined
  if (variacoes.length && !variacao)
    throw new ComprasError(
      400,
      "Selecione explicitamente uma variação para este item da compra.",
    )
  if (informada && !variacao)
    throw new ComprasError(400, "Variação não pertence ao produto na empresa.")
  if (
    variacao &&
    (variacao.status !== "ATIVO" ||
      !variacaoAtivaNaEmpresa(variacao, ctx.idEmpresa) ||
      ((item.id_cor || item.id_tamanho) &&
        (variacao.id_cor !== item.id_cor ||
          variacao.id_tamanho !== item.id_tamanho)))
  )
    throw new ComprasError(
      400,
      "Variação indisponível ou incompatível com o item da compra.",
    )
  return variacao ?? null
}
export async function comprovarMovimento(
  tx: Transaction,
  ctx: Pick<Contexto, "idEmpresa">,
  fisico: Fisico,
  idMov: number,
  idItem: number,
  idVariacao: number | null,
  local: number,
  setor: number,
) {
  const m = fisico.movimentos.find((m) => m.id === idMov)
  if (!m) throw new ComprasError(409, "Movimento não encontrado nesta compra.")
  if (
    fisico.porMovimento.get(idMov) !== idItem ||
    m.id_variacao !== idVariacao ||
    m.id_local_estoque !== local ||
    m.id_setor !== setor
  )
    falha(
      "O recebimento selecionado não comprova a posição e a variação desta linha fiscal.",
    )
  const livro = await tx.kardex.findMany({ where: { id_movimentacao: m.id } })
  if (
    livro.length !== 1 ||
    livro.some(
      (k) =>
        k.id_empresa !== ctx.idEmpresa ||
        k.id_produto !== m.id_produto ||
        k.id_local_estoque !== local ||
        k.id_setor !== setor ||
        k.tipo_movimentacao !== "ENTRADA" ||
        !k.quantidade.eq(m.quantidade) ||
        !k.saldo_atual.minus(k.saldo_anterior).eq(m.quantidade),
    )
  )
    falha(
      "Recebimento sem comprovação íntegra no Kardex. Regularização necessária.",
    )
  return m
}
export async function vincularMovimento(
  tx: Transaction,
  ctx: Pick<Contexto, "idEmpresa">,
  fisico: Fisico,
  idMov: number,
  idItem: number,
) {
  const m = fisico.movimentos.find((m) => m.id === idMov)!
  if (!m.compra_recebimento_linha)
    await tx.compra_recebimento_linha.create({
      data: {
        id_movimentacao: idMov,
        id_empresa: ctx.idEmpresa,
        id_compra: fisico.compra.id,
        id_compra_item: idItem,
        id_produto: m.id_produto,
        quantidade: m.quantidade,
      },
    })
}
export async function receberFisico(
  tx: Transaction,
  ctx: Contexto,
  id: number,
  solicitacoes: SolicitacaoRecebimento[] | undefined,
  chave: string,
  setor?: number | null,
  observacao?: string | null,
  valores?: Prisma.Decimal[],
) {
  await tx.$queryRaw`SELECT id FROM compras WHERE id=${id} AND id_empresa=${ctx.idEmpresa} FOR UPDATE`
  const estado = await carregarFisico(tx, ctx, id),
    { compra } = estado
  if (estado.pendencias.length) falha(estado.pendencias.join(" "))
  if (compra.status !== "EMITIDA")
    falha(
      "Somente uma compra emitida com saldo pendente aceita nova entrada física.",
    )
  const pedidos: SolicitacaoRecebimento[] =
    solicitacoes ??
    compra.compra_itens.flatMap((i) => {
      const q = i.quantidade.minus(estado.recebidos.get(i.id) ?? 0)
      return q.gt(0) ? [{ idItemCompra: i.id, quantidade: q.toFixed(3) }] : []
    })
  if (!pedidos.length)
    falha("Não há quantidades pendentes para receber nesta compra.")
  const linhas = pedidos.map((p) => {
    const candidatos = compra.compra_itens.filter((i) =>
      p.idItemCompra ? i.id === p.idItemCompra : i.id_produto === p.idProduto,
    )
    if (candidatos.length !== 1)
      throw new ComprasError(
        400,
        "Informe o ID do item da compra para desambiguar o recebimento.",
      )
    if (p.idProduto && p.idProduto !== candidatos[0].id_produto)
      throw new ComprasError(400, "Produto não corresponde ao item da compra.")
    return { pedido: p, item: candidatos[0] }
  })
  const acumulados = new Map<number, Prisma.Decimal>()
  for (const { pedido, item } of linhas) {
    const q = new Prisma.Decimal(pedido.quantidade)
    if (
      !q.isFinite() ||
      q.lte(0) ||
      q.decimalPlaces() > 3 ||
      q.gt("999999999999.999")
    )
      throw new ComprasError(400, "Quantidade recebida inválida.")
    const total = (acumulados.get(item.id) ?? new Prisma.Decimal(0)).plus(q)
    acumulados.set(item.id, total)
    if (total.plus(estado.recebidos.get(item.id) ?? 0).gt(item.quantidade))
      throw new ComprasError(
        400,
        `A quantidade recebida de ${item.produtos.nome} excede o saldo pendente.`,
      )
  }
  let texto: string
  try {
    texto = observacaoRecebimento(compra.codigo, chave, observacao ?? null)
  } catch (e) {
    if (e instanceof ObservacaoForaDoLimite)
      throw new ComprasError(400, e.message)
    throw e
  }
  const criados: {
    idMovimentacao: number
    idCompraItem: number
    quantidade: string
  }[] = []
  for (let index = 0; index < linhas.length; index++) {
    const { pedido, item } = linhas[index]
    const variacao = await variacaoDoItem(tx, ctx, item, pedido.idVariacao)
    const posicao = await tx.estoque.findUnique({
      where: {
        id_empresa_id_local_estoque_id_produto: {
          id_empresa: ctx.idEmpresa,
          id_local_estoque: compra.id_local_estoque,
          id_produto: item.id_produto,
        },
      },
    })
    const informado = pedido.idSetorDestino ?? setor
    if (informado && posicao && posicao.id_setor !== informado)
      throw new ComprasError(
        400,
        "O setor informado diverge da posição de estoque existente.",
      )
    const idSetor = informado ?? posicao?.id_setor
    if (!idSetor)
      throw new ComprasError(
        400,
        `Informe o setor de destino no estoque para ${item.produtos.nome}.`,
      )
    const entrada = await movimentarNaTransacao(
      tx,
      ctx,
      {
        idProduto: item.id_produto,
        idVariacao: variacao?.id,
        idLocalEstoque: compra.id_local_estoque,
        idSetor,
        quantidade: pedido.quantidade,
        observacao: texto,
      },
      "entrada",
      {
        tipo: "ENTRADA_NF",
        nome: ORIGEM_COMPRA,
        id,
        chave: chaveMovimento("compra", `${chave}:${index}`),
        valorTotal:
          valores?.[index] ??
          new Prisma.Decimal(
            totalItem(pedido.quantidade, item.valor_unitario.toFixed(2)),
          ),
      },
    )
    await tx.compra_recebimento_linha.create({
      data: {
        id_movimentacao: entrada.idMovimentacao,
        id_empresa: ctx.idEmpresa,
        id_compra: id,
        id_compra_item: item.id,
        id_produto: item.id_produto,
        quantidade: pedido.quantidade,
      },
    })
    criados.push({
      idMovimentacao: entrada.idMovimentacao,
      idCompraItem: item.id,
      quantidade: pedido.quantidade,
    })
  }
  const completa = compra.compra_itens.every((i) =>
    (estado.recebidos.get(i.id) ?? new Prisma.Decimal(0))
      .plus(acumulados.get(i.id) ?? 0)
      .eq(i.quantidade),
  )
  const r = await tx.compras.updateMany({
    where: { id, id_empresa: ctx.idEmpresa, status: "EMITIDA" },
    data: {
      status: completa ? "ENTREGUE" : "EMITIDA",
      data_atualizacao: new Date(),
    },
  })
  if (completa && r.count !== 1) falha("Compra alterada durante o recebimento.")
  if (compra.id_pedido_compra_legado)
    await tx.pedido_compra.updateMany({
      where: {
        id: compra.id_pedido_compra_legado,
        id_empresa: ctx.idEmpresa,
        status: { in: ["EMITIDO", "PARCIAL"] },
      },
      data: { status: completa ? "RECEBIDO" : "PARCIAL" },
    })
  await auditar(
    tx,
    ctx,
    "compras",
    id,
    {
      status: compra.status,
      recebidos: [...estado.recebidos].map(([id, q]) => ({
        id,
        quantidade: q.toFixed(3),
      })),
    },
    {
      status: completa ? "ENTREGUE" : "EMITIDA",
      recebidos: compra.compra_itens.map((i) => ({
        id: i.id,
        quantidade: (estado.recebidos.get(i.id) ?? new Prisma.Decimal(0))
          .plus(acumulados.get(i.id) ?? 0)
          .toFixed(3),
      })),
      movimentos: criados,
    },
  )
  if (compra.pedido_compra)
    await auditar(
      tx,
      ctx,
      "pedido_compra",
      compra.pedido_compra.id,
      { status: compra.pedido_compra.status },
      { status: completa ? "RECEBIDO" : "PARCIAL", idCompra: id },
    )
  return criados
}

export function recebidosPorItem(
  itens: {
    id: number
    id_produto: number
    id_cor?: number | null
    id_tamanho?: number | null
  }[],
  movimentos: {
    id_produto: number
    quantidade: { toFixed(n: number): string }
    compra_recebimento_linha?: { id_compra_item: number } | null
    produto_variacoes?: {
      id_cor: number | null
      id_tamanho: number | null
    } | null
  }[],
) {
  const recebido = new Map<number, string>()
  for (const m of movimentos) {
    const candidatos = itens.filter(
      (i) =>
        i.id_produto === m.id_produto &&
        ((!i.id_cor && !i.id_tamanho) ||
          (i.id_cor === m.produto_variacoes?.id_cor &&
            i.id_tamanho === m.produto_variacoes?.id_tamanho)),
    )
    const alvo = m.compra_recebimento_linha
      ? itens.find((i) => i.id === m.compra_recebimento_linha!.id_compra_item)
      : candidatos.length === 1
        ? candidatos[0]
        : undefined
    if (alvo)
      recebido.set(
        alvo.id,
        new Prisma.Decimal(recebido.get(alvo.id) ?? 0)
          .plus(m.quantidade.toFixed(3))
          .toFixed(3),
      )
  }
  return recebido
}

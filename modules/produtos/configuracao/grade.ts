import "server-only"

import { Prisma } from "@/generated/prisma/client"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors"
import {
  auditar,
  escopo,
  exigirProdutoAtivo,
  gravar,
  intervalo,
  ler,
  pagina,
  type Contexto,
  type ContextoEscrita,
  type Tx,
} from "./repository"
import type { Combinacao, Pagina } from "./schema"

const chave = ({ id_cor, id_tamanho }: Combinacao) =>
  `${id_cor ?? ""}:${id_tamanho ?? ""}`
const temDimensao = ({ id_cor, id_tamanho }: Combinacao) =>
  id_cor !== null || id_tamanho !== null

export function listarGrade(ctx: Contexto, filtros: Pagina) {
  return ler(ctx, async (tx) => {
    const where = escopo(ctx)
    const [rows, count] = await Promise.all([
      tx.produto_variacoes.findMany({
        where,
        orderBy: { id: "asc" },
        ...intervalo(filtros),
      }),
      tx.produto_variacoes.count({ where }),
    ])
    return pagina(rows, count, filtros)
  })
}

async function verificarDimensoes(tx: Tx, ctx: Contexto, itens: Combinacao[]) {
  if (itens.some((item) => !temDimensao(item)))
    throw new ValidationError("Informe pelo menos uma cor ou um tamanho.")
  const cores = [
    ...new Set(
      itens.flatMap(({ id_cor }) => (id_cor === null ? [] : [id_cor])),
    ),
  ]
  const tamanhos = [
    ...new Set(
      itens.flatMap(({ id_tamanho }) =>
        id_tamanho === null ? [] : [id_tamanho],
      ),
    ),
  ]
  if (cores.length) {
    const rows = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM cores
      WHERE id IN (${Prisma.join(cores)}) AND status = 'ATIVA'
        AND (id_empresa IS NULL OR id_empresa = ${ctx.idEmpresa})
      ORDER BY id FOR UPDATE`
    if (rows.length !== cores.length)
      throw new ValidationError("Cor ativa não encontrada para a empresa.")
  }
  if (tamanhos.length) {
    const rows = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM tamanhos
      WHERE id IN (${Prisma.join(tamanhos)}) AND status = 'ATIVO' AND id_empresa = ${ctx.idEmpresa}
      ORDER BY id FOR UPDATE`
    if (rows.length !== tamanhos.length)
      throw new ValidationError("Tamanho ativo não encontrado para a empresa.")
  }
}

async function verificarOperacoes(
  tx: Tx,
  ctx: Contexto,
  variacao: {
    id: number
    id_cor: number | null
    id_tamanho: number | null
  } | null,
) {
  const empresaProduto = escopo(ctx)
  const id_variacao = variacao?.id ?? null
  const quantidade = {
    OR: [{ quantidade: { not: 0 } }, { quantidade_reservada: { not: 0 } }],
  }
  const saldo = variacao
    ? await tx.estoque_variacao.findFirst({
        where: { ...empresaProduto, id_variacao: variacao.id, ...quantidade },
        select: { id: true },
      })
    : await tx.estoque.findFirst({
        where: { ...empresaProduto, ...quantidade },
        select: { id: true },
      })
  if (saldo)
    throw new ConflictError(
      variacao
        ? "Regularize o saldo físico e reservado desta variação antes de inativá-la."
        : "Regularize o saldo sem grade no módulo de estoque antes de gerar as primeiras variações.",
    )
  const reserva = await tx.reserva_estoque.findFirst({
    where: { ...empresaProduto, id_variacao, status: "ATIVA" },
    select: { id: true },
  })
  if (reserva)
    throw new ConflictError(
      "Há uma reserva ativa. Conclua ou libere a reserva antes de alterar a grade.",
    )
  const transferencia = await tx.transferencia_estoque.findFirst({
    where: { ...empresaProduto, id_variacao, status: "ENVIADA" },
    select: { id: true },
  })
  if (transferencia)
    throw new ConflictError(
      "Conclua a transferência de estoque antes de alterar a grade.",
    )
  const pedido = await tx.pedido_cliente_item.findFirst({
    where: {
      id_produto: ctx.idProduto,
      id_variacao,
      pedido_cliente: {
        id_empresa: ctx.idEmpresa,
        OR: [
          { status: { notIn: ["CONCLUIDO", "CANCELADO"] } },
          { pedido_cancelamento: { some: { pedido_ativo: { not: null } } } },
        ],
      },
    },
    select: { id: true },
  })
  if (pedido)
    throw new ConflictError(
      "Há um pedido ou cancelamento em aberto. Conclua o documento antes de alterar a grade.",
    )
  const producao = await tx.ordem_producao_item.findFirst({
    where: {
      id_produto: ctx.idProduto,
      ...(variacao && {
        id_cor: variacao.id_cor,
        id_tamanho: variacao.id_tamanho,
      }),
      ordem_producao: {
        id_empresa: ctx.idEmpresa,
        status: { notIn: ["CONCLUIDA", "CANCELADA"] },
      },
    },
    select: { id: true },
  })
  if (producao)
    throw new ConflictError(
      "Conclua a ordem de produção em aberto antes de alterar a grade.",
    )
}

export function gerarGrade(ctx: ContextoEscrita, itens: Combinacao[]) {
  return gravar(ctx, ["pode_criar"], async (tx, produto) => {
    exigirProdutoAtivo(produto)
    const unicas = [
      ...new Map(itens.map((item) => [chave(item), item])).values(),
    ]
    const encontrados = await tx.produto_variacoes.findMany({
      where: { ...escopo(ctx), OR: unicas },
      orderBy: { id: "asc" },
    })
    const atuais = new Map<string, (typeof encontrados)[number]>()
    for (const item of encontrados) {
      if (!atuais.has(chave(item))) atuais.set(chave(item), item)
    }
    const novas = unicas.filter((item) => !atuais.has(chave(item)))
    // Repetir um lote gravado não altera disponibilidade nem exige cadastros ainda ativos.
    await verificarDimensoes(tx, ctx, novas)
    if (
      novas.length &&
      !(await tx.produto_variacoes.findFirst({
        where: {
          ...escopo(ctx),
          OR: [{ id_cor: { not: null } }, { id_tamanho: { not: null } }],
        },
        select: { id: true },
      }))
    )
      await verificarOperacoes(tx, ctx, null)

    const criadas = []
    if (novas.length) {
      await tx.produto_variacoes.createMany({
        data: novas.map((item) => ({ ...escopo(ctx), ...item })),
      })
      criadas.push(
        ...(await tx.produto_variacoes.findMany({
          where: { ...escopo(ctx), OR: novas },
        })),
      )
    }
    for (const item of criadas) atuais.set(chave(item), item)
    if (criadas.length) {
      await tx.auditoria.createMany({
        data: criadas.map((item) => ({
          id_empresa: ctx.idEmpresa,
          id_usuario: ctx.idUsuario,
          tabela: "produto_variacoes",
          id_registro: item.id,
          acao: "INSERT",
          dados_novos: JSON.stringify(item),
        })),
      })
    }
    return {
      rows: unicas.map((item) => atuais.get(chave(item))!),
      criadas: criadas.length,
    }
  })
}

export function alterarGrade(
  ctx: ContextoEscrita,
  id: number,
  status: "ATIVO" | "INATIVO",
) {
  return gravar(
    ctx,
    status === "INATIVO" ? ["pode_editar", "pode_excluir"] : ["pode_editar"],
    async (tx, produto) => {
      const where = { ...escopo(ctx), id }
      const antes = await tx.produto_variacoes.findFirst({ where })
      if (!antes) throw new NotFoundError("Variação não encontrada no produto.")
      if (antes.status === status) return antes
      if (status === "ATIVO") {
        exigirProdutoAtivo(produto)
        await verificarDimensoes(tx, ctx, [antes])
        const duplicada = await tx.produto_variacoes.findFirst({
          where: {
            ...escopo(ctx),
            id: { not: id },
            id_cor: antes.id_cor,
            id_tamanho: antes.id_tamanho,
            status: "ATIVO",
          },
          select: { id: true },
        })
        if (duplicada)
          throw new ConflictError(
            "Outra variação ativa já possui esta combinação.",
          )
      } else {
        await verificarOperacoes(tx, ctx, antes)
      }
      const depois = await tx.produto_variacoes.update({
        where,
        data: { status },
      })
      await auditar(tx, ctx, "produto_variacoes", antes, depois)
      return depois
    },
  )
}

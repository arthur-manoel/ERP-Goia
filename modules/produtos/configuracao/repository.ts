import "server-only"

import { Prisma } from "@/generated/prisma/client"
import { ConflictError, NotFoundError, ValidationError } from "@/lib/api/errors"
import { serializarJsonTextMysql } from "@/lib/limites-texto"
import { prisma } from "@/lib/prisma"
import { disputaPersistencia } from "@/lib/prisma-concorrencia"
import { bloquearProdutoEstoque } from "@/modules/estoque/estoque.livro"
import { withCompanyWriteLock } from "../../catalogos/transactions"
import type { Pagina } from "./schema"

export type Tx = Prisma.TransactionClient
export type Contexto = {
  idEmpresa: number
  idUsuario: number
  idProduto: number
}

export const escopo = (ctx: Contexto) => ({
  id_empresa: ctx.idEmpresa,
  id_produto: ctx.idProduto,
})

export async function consultarProduto(tx: Tx, ctx: Contexto) {
  const produto = await tx.produto_empresa.findUnique({
    where: { id_empresa_id_produto: escopo(ctx) },
    select: {
      status: true,
      produtos: { select: { status: true } },
    },
  })
  if (!produto) throw new NotFoundError("Produto não encontrado na empresa.")
  return produto
}

export function exigirProdutoAtivo(
  produto: Awaited<ReturnType<typeof consultarProduto>>,
) {
  if (produto.status !== "ATIVO" || produto.produtos.status !== "ATIVO")
    throw new ConflictError(
      "O produto e seu vínculo com a empresa precisam estar ativos.",
    )
}

export function ler<T>(ctx: Contexto, operacao: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      await consultarProduto(tx, ctx)
      return operacao(tx)
    },
    { isolationLevel: "RepeatableRead" },
  )
}

export async function gravar<T>(
  ctx: Contexto,
  operacao: (
    tx: Tx,
    produto: Awaited<ReturnType<typeof consultarProduto>>,
  ) => Promise<T>,
) {
  try {
    return await withCompanyWriteLock([ctx.idEmpresa], async (tx) => {
      await bloquearProdutoEstoque(tx, ctx, ctx.idProduto)
      return operacao(tx, await consultarProduto(tx, ctx))
    })
  } catch (error) {
    if (
      disputaPersistencia(error) ||
      (error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2003", "P2025"].includes(error.code))
    )
      throw new ConflictError(
        "O cadastro foi alterado. Consulte os dados e tente novamente.",
      )
    throw error
  }
}

export function intervalo({ page, limit }: Pagina) {
  return { skip: (page - 1) * limit, take: limit }
}

export function pagina<T>(rows: T[], count: number, { page, limit }: Pagina) {
  const totalPages = Math.ceil(count / limit)
  if (totalPages > 10_000)
    throw new ConflictError(
      "Volume superior à paginação disponível. Aumente o limite por página.",
    )
  return { rows, count, page, limit, totalPages }
}

type Registro = { id: number }
export async function auditar<T extends Registro>(
  tx: Tx,
  ctx: Contexto,
  tabela: "produto_variacoes" | "produto_fornecedor",
  antes: T | null,
  depois: T,
) {
  const json = (valor: T) =>
    serializarJsonTextMysql(valor, (m) => new ValidationError(m))
  const dadosAnteriores = antes === null ? null : json(antes)
  const dadosNovos = json(depois)
  if (dadosAnteriores === dadosNovos) return
  await tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela,
      id_registro: depois.id,
      acao: antes ? "UPDATE" : "INSERT",
      dados_anteriores: dadosAnteriores,
      dados_novos: dadosNovos,
    },
  })
}

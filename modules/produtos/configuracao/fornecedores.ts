import "server-only"

import type { Prisma } from "@/generated/prisma/client"
import { ConflictError, NotFoundError } from "@/lib/api/errors"
import { fornecedorDisponivel } from "@/modules/empresa-fornecedor/policy"
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
import type { CriarFornecedor, EditarFornecedor, Pagina } from "./schema"

function incluirFornecedor(ctx: Contexto) {
  return {
    fornecedores: {
      select: {
        id_empresa: true,
        razao_social: true,
        nome_fantasia: true,
        status: true,
        empresa_fornecedor: {
          where: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
          select: { id: true },
        },
      },
    },
  } satisfies Prisma.produto_fornecedorInclude
}

function representar(
  registro: Prisma.produto_fornecedorGetPayload<{
    include: ReturnType<typeof incluirFornecedor>
  }>,
) {
  const { fornecedores, ...vinculo } = registro
  const { id_empresa, razao_social, nome_fantasia } = fornecedores
  const visivel = id_empresa === null || id_empresa === vinculo.id_empresa
  const elegivel =
    visivel &&
    fornecedores.status === "ATIVO" &&
    (fornecedores.id_empresa === vinculo.id_empresa ||
      fornecedores.empresa_fornecedor.length > 0)
  return {
    ...vinculo,
    preco_ultima_compra: vinculo.preco_ultima_compra?.toFixed(2) ?? null,
    quantidade_minima: vinculo.quantidade_minima?.toFixed(3) ?? null,
    fornecedor_principal:
      vinculo.fornecedor_principal && vinculo.status === "ATIVO" && elegivel,
    fornecedores: visivel
      ? { razao_social, nome_fantasia }
      : { razao_social: "Fornecedor indisponível", nome_fantasia: null },
  }
}

export function listarFornecedores(ctx: Contexto, filtros: Pagina) {
  return ler(ctx, async (tx) => {
    const where = escopo(ctx)
    const [rows, count] = await Promise.all([
      tx.produto_fornecedor.findMany({
        where,
        include: incluirFornecedor(ctx),
        orderBy: { id: "asc" },
        ...intervalo(filtros),
      }),
      tx.produto_fornecedor.count({ where }),
    ])
    return pagina(rows.map(representar), count, filtros)
  })
}

export function listarOpcoes(ctx: Contexto, filtros: Pagina) {
  return ler(ctx, async (tx) => {
    const where = fornecedorDisponivel(ctx.idEmpresa)
    const [rows, count] = await Promise.all([
      tx.fornecedores.findMany({
        where,
        orderBy: { id: "asc" },
        ...intervalo(filtros),
        select: { id: true, razao_social: true, nome_fantasia: true },
      }),
      tx.fornecedores.count({ where }),
    ])
    return pagina(
      rows.map(({ id, nome_fantasia, razao_social }) => ({
        id,
        nome: nome_fantasia || razao_social,
      })),
      count,
      filtros,
    )
  })
}

async function obter(tx: Tx, ctx: Contexto, id: number) {
  const registro = await tx.produto_fornecedor.findFirst({
    where: { ...escopo(ctx), id },
    include: incluirFornecedor(ctx),
  })
  if (!registro)
    throw new NotFoundError("Vínculo de fornecedor não encontrado no produto.")
  return representar(registro)
}

export function consultarFornecedor(ctx: Contexto, id: number) {
  return ler(ctx, (tx) => obter(tx, ctx, id))
}

async function exigirFornecedorElegivel(tx: Tx, ctx: Contexto, id: number) {
  await tx.$queryRaw`SELECT id FROM fornecedores WHERE id = ${id}
    AND (id_empresa = ${ctx.idEmpresa} OR id_empresa IS NULL) FOR UPDATE`
  const registro = await tx.fornecedores.findFirst({
    where: { id, ...fornecedorDisponivel(ctx.idEmpresa) },
    select: { id: true },
  })
  if (!registro)
    throw new NotFoundError("Fornecedor elegível não encontrado na empresa.")
}

async function limparPrincipalAnterior(tx: Tx, ctx: Contexto, id?: number) {
  const where = {
    ...escopo(ctx),
    fornecedor_principal: true,
    ...(id === undefined ? {} : { id: { not: id } }),
  }
  const anteriores = await tx.produto_fornecedor.findMany({ where })
  if (!anteriores.length) return
  await tx.produto_fornecedor.updateMany({
    where,
    data: { fornecedor_principal: false },
  })
  for (const item of anteriores)
    await auditar(tx, ctx, "produto_fornecedor", item, {
      ...item,
      fornecedor_principal: false,
    })
}

export function criarFornecedor(ctx: ContextoEscrita, dados: CriarFornecedor) {
  return gravar(ctx, ["pode_criar"], async (tx, produto) => {
    exigirProdutoAtivo(produto)
    await exigirFornecedorElegivel(tx, ctx, dados.id_fornecedor)
    const existente = await tx.produto_fornecedor.findUnique({
      where: {
        id_empresa_id_produto_id_fornecedor: {
          ...escopo(ctx),
          id_fornecedor: dados.id_fornecedor,
        },
      },
      select: { id: true },
    })
    if (existente)
      throw new ConflictError(
        "Fornecedor já vinculado ao produto. Consulte o vínculo existente.",
      )
    if (dados.fornecedor_principal) await limparPrincipalAnterior(tx, ctx)
    const depois = await tx.produto_fornecedor.create({
      data: { ...escopo(ctx), ...dados },
    })
    await auditar(tx, ctx, "produto_fornecedor", null, depois)
    return obter(tx, ctx, depois.id)
  })
}

export function editarFornecedor(
  ctx: ContextoEscrita,
  id: number,
  dados: EditarFornecedor,
) {
  return gravar(
    ctx,
    dados.status === "INATIVO"
      ? ["pode_editar", "pode_excluir"]
      : ["pode_editar"],
    async (tx, produto) => {
      const where = { ...escopo(ctx), id }
      const antes = await tx.produto_fornecedor.findFirst({ where })
      if (!antes)
        throw new NotFoundError(
          "Vínculo de fornecedor não encontrado no produto.",
        )
      const { status, ...condicoes } = dados
      const novasCondicoes = Object.keys(condicoes).length > 0
      const reativando = status === "ATIVO" && antes.status !== "ATIVO"
      if (status !== "INATIVO" || novasCondicoes) exigirProdutoAtivo(produto)
      if (novasCondicoes && antes.status === "INATIVO" && !reativando)
        throw new ConflictError(
          "Reative o vínculo antes de editar suas condições.",
        )
      if (reativando || condicoes.fornecedor_principal === true)
        await exigirFornecedorElegivel(tx, ctx, antes.id_fornecedor)
      if (condicoes.fornecedor_principal === true)
        await limparPrincipalAnterior(tx, ctx, id)
      const depois = await tx.produto_fornecedor.update({
        where,
        data: {
          ...condicoes,
          status,
          fornecedor_principal:
            status === "INATIVO"
              ? false
              : (condicoes.fornecedor_principal ??
                (reativando ? false : undefined)),
        },
      })
      await auditar(tx, ctx, "produto_fornecedor", antes, depois)
      return obter(tx, ctx, depois.id)
    },
  )
}

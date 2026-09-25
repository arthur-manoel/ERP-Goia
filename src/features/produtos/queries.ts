import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { getEmpresaAtual } from "@/lib/sessao"
import { ITENS_POR_PAGINA, type StatusProduto } from "./constantes"

export type FiltrosProdutos = {
  busca?: string
  status?: StatusProduto
  pagina?: number
}

export function normalizarStatusProduto(
  valor?: string,
): StatusProduto | undefined {
  return valor === "ATIVO" || valor === "INATIVO" ? valor : undefined
}

export function normalizarPagina(valor?: string) {
  const pagina = Number(valor)
  return Number.isInteger(pagina) && pagina > 0 ? pagina : 1
}

export async function listarProdutos({
  busca,
  status,
  pagina = 1,
}: FiltrosProdutos) {
  const { idEmpresa } = await getEmpresaAtual()
  const termoBusca = busca?.trim()

  const where: Prisma.produto_empresaWhereInput = {
    id_empresa: idEmpresa,
    ...(status && { status }),
    ...(termoBusca && {
      OR: [
        { codigo_interno: { contains: termoBusca } },
        {
          produtos: {
            is: {
              OR: [
                { nome: { contains: termoBusca } },
                { codigo: { contains: termoBusca } },
              ],
            },
          },
        },
      ],
    }),
  }

  const [produtos, total] = await Promise.all([
    prisma.produto_empresa.findMany({
      where,
      include: {
        produtos: {
          include: {
            categorias: { select: { nome: true } },
            tipos_produto: { select: { nome: true } },
          },
        },
      },
      orderBy: { produtos: { nome: "asc" } },
      skip: (pagina - 1) * ITENS_POR_PAGINA,
      take: ITENS_POR_PAGINA,
    }),
    prisma.produto_empresa.count({ where }),
  ])

  const totaisEstoque =
    produtos.length === 0
      ? []
      : await prisma.estoque.groupBy({
          by: ["id_empresa", "id_produto"],
          where: {
            id_empresa: idEmpresa,
            id_produto: { in: produtos.map((produto) => produto.id_produto) },
          },
          _sum: { quantidade: true },
        })

  const estoquePorProduto = new Map(
    totaisEstoque.map((estoque) => [
      estoque.id_produto,
      estoque._sum.quantidade ?? 0,
    ]),
  )

  return {
    produtos: produtos.map((produtoEmpresa) => ({
      ...produtoEmpresa,
      estoque_atual: estoquePorProduto.get(produtoEmpresa.id_produto) ?? 0,
    })),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / ITENS_POR_PAGINA)),
  }
}

export type ResultadoProdutos = Awaited<ReturnType<typeof listarProdutos>>

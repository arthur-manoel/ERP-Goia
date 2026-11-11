import "server-only"
import { prisma } from "@/lib/prisma"
import type { Contexto } from "./pedidos.authorization"

export async function consultarOpcoes(ctx: Contexto, busca: string) {
  const [clientes, catalogo] = await prisma.$transaction([
    prisma.clientes.findMany({
      where: {
        id_empresa: ctx.idEmpresa,
        status: "ATIVO",
        nome_razao_social: { contains: busca },
      },
      select: { id: true, nome_razao_social: true },
      orderBy: { nome_razao_social: "asc" },
      take: 50,
    }),
    prisma.produto_empresa.findMany({
      where: {
        id_empresa: ctx.idEmpresa,
        status: "ATIVO",
        produtos: {
          status: "ATIVO",
          permite_venda: true,
          OR: [{ nome: { contains: busca } }, { codigo: { contains: busca } }],
        },
      },
      select: {
        id_produto: true,
        id_cor: true,
        id_tamanho: true,
        preco_venda: true,
        produtos: {
          select: {
            nome: true,
            codigo: true,
            produto_variacoes: {
              where: { id_empresa: ctx.idEmpresa },
              select: {
                id: true,
                id_cor: true,
                id_tamanho: true,
                status: true,
                cores: {
                  select: { nome: true, status: true, id_empresa: true },
                },
                tamanhos: {
                  select: { nome: true, status: true, id_empresa: true },
                },
              },
              orderBy: { id: "asc" },
            },
          },
        },
      },
      orderBy: { id_produto: "asc" },
      take: 50,
    }),
  ])
  return {
    clientes,
    produtos: catalogo.map((p) => ({
      id: p.id_produto,
      nome: p.produtos.nome,
      codigo: p.produtos.codigo,
      preco: p.preco_venda.toFixed(2),
      temGrade:
        p.id_cor !== null ||
        p.id_tamanho !== null ||
        p.produtos.produto_variacoes.some(
          (v) => v.id_cor !== null || v.id_tamanho !== null,
        ),
      variacoes: p.produtos.produto_variacoes
        .filter(
          (v) =>
            v.status === "ATIVO" &&
            (!v.cores ||
              (v.cores.status === "ATIVA" &&
                (v.cores.id_empresa === null ||
                  v.cores.id_empresa === ctx.idEmpresa))) &&
            (!v.tamanhos ||
              (v.tamanhos.status === "ATIVO" &&
                v.tamanhos.id_empresa === ctx.idEmpresa)),
        )
        .map((v) => ({
          id: v.id,
          cor: v.cores?.nome ?? "Sem cor",
          tamanho: v.tamanhos?.nome ?? "Sem tamanho",
        })),
    })),
  }
}

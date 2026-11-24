import "server-only"
import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { conferir, type Contexto } from "@/modules/reservas/operacoes"
import { variacaoAtivaNaEmpresa } from "@/modules/estoque/estoque.grade"

const textoBusca = z.string().trim().min(1).max(100).optional()
export const buscaCatalogoSchema = z.strictObject({
  escopo: z.enum(["movimentacoes", "kardex"]).optional(),
  idProduto: z.coerce.number().int().positive().max(2147483647).optional(),
  produto: textoBusca,
  local: textoBusca,
  setor: textoBusca,
  variacao: textoBusca,
})
const limite = 500

export function consultarCatalogo(
  ctx: Contexto,
  busca: z.infer<typeof buscaCatalogoSchema>,
) {
  return prisma.$transaction(
    async (tx) => {
      await conferir(tx, ctx, [["ESTOQUE", "ler"]])
      const escopo = { id_empresa: ctx.idEmpresa }
      const filtroProduto: Prisma.produtosWhereInput = {
        ...(busca.idProduto && { id: busca.idProduto }),
        AND: [
          {
            OR: [
              { produto_empresa: { some: escopo } },
              {
                movimentacao_estoque: {
                  some: {
                    ...escopo,
                    ...(busca.escopo === "kardex"
                      ? { kardex: { is: { ...escopo } } }
                      : {}),
                  },
                },
              },
            ],
          },
          ...(busca.produto
            ? [
                {
                  OR: [
                    { nome: { contains: busca.produto } },
                    { codigo: { contains: busca.produto } },
                    {
                      produto_empresa: {
                        some: {
                          ...escopo,
                          codigo_interno: { contains: busca.produto },
                        },
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      }
      const [produtos, locais, setores, vinculo] = await Promise.all([
        tx.produtos.findMany({
          where: filtroProduto,
          orderBy: [{ nome: "asc" }, { id: "asc" }],
          take: limite + 1,
          select: {
            id: true,
            nome: true,
            codigo: true,
            unidade: true,
            status: true,
            controla_estoque: true,
            produto_empresa: {
              where: escopo,
              select: { status: true, codigo_interno: true },
            },
          },
        }),
        tx.locais_estoque.findMany({
          where: {
            ...escopo,
            ...(busca.local ? { nome: { contains: busca.local } } : {}),
          },
          select: { id: true, nome: true, status: true },
          orderBy: [{ nome: "asc" }, { id: "asc" }],
          take: limite + 1,
        }),
        tx.setores.findMany({
          where: {
            ...escopo,
            ...(busca.setor ? { nome: { contains: busca.setor } } : {}),
          },
          select: { id: true, nome: true, status: true },
          orderBy: [{ nome: "asc" }, { id: "asc" }],
          take: limite + 1,
        }),
        tx.usuario_empresa.findFirstOrThrow({
          where: { ...escopo, id_usuario: ctx.idUsuario, status: "ATIVO" },
          select: {
            nivel_acesso: true,
            usuarios: { select: { nivel_acesso: true } },
            permissoes_usuario: {
              where: { recurso: { in: ["ESTOQUE", "RELATORIOS"] } },
              select: {
                recurso: true,
                pode_criar: true,
                pode_editar: true,
                pode_ler: true,
              },
            },
          },
        }),
      ])
      const ids = produtos.slice(0, limite).map((p) => p.id)
      const termo = busca.variacao
      const nomesAutorizados = termo
        ? { nome: { contains: termo }, OR: [escopo, { id_empresa: null }] }
        : undefined
      const variacoes = await tx.produto_variacoes.findMany({
        where: {
          ...escopo,
          ...(termo
            ? { produtos: filtroProduto }
            : { id_produto: { in: ids } }),
          ...(nomesAutorizados
            ? {
                OR: [
                  { cores: nomesAutorizados },
                  { tamanhos: { ...escopo, nome: nomesAutorizados.nome } },
                ],
              }
            : {}),
        },
        orderBy: { id: "asc" },
        take: limite + 1,
        select: {
          id: true,
          id_produto: true,
          status: true,
          cores: { select: { nome: true, id_empresa: true, status: true } },
          tamanhos: { select: { nome: true, id_empresa: true, status: true } },
        },
      })
      const admin =
        vinculo.nivel_acesso === "EMPRESA" ||
        vinculo.usuarios.nivel_acesso === "ADMIN"
      const p = vinculo.permissoes_usuario.find((p) => p.recurso === "ESTOQUE")
      const relatorios = vinculo.permissoes_usuario.find(
        (p) => p.recurso === "RELATORIOS",
      )
      const posicoes = (
        lista: { id: number; nome: string; status: string }[],
      ) =>
        lista
          .slice(0, limite)
          .map((x) => ({ id: x.id, nome: x.nome, ativo: x.status === "ATIVO" }))
      return {
        produtos: produtos.slice(0, limite).map((p) => ({
          id: p.id,
          nome: p.nome,
          codigo: p.produto_empresa[0]?.codigo_interno ?? p.codigo,
          unidade: p.unidade,
          ativo:
            p.status === "ATIVO" &&
            p.controla_estoque &&
            p.produto_empresa[0]?.status === "ATIVO",
        })),
        variacoes: variacoes.slice(0, limite).map((v) => ({
          id: v.id,
          idProduto: v.id_produto,
          nome:
            [
              v.cores?.id_empresa == null ||
              v.cores.id_empresa === ctx.idEmpresa
                ? v.cores?.nome
                : null,
              v.tamanhos?.id_empresa == null ||
              v.tamanhos.id_empresa === ctx.idEmpresa
                ? v.tamanhos?.nome
                : null,
            ]
              .filter(Boolean)
              .join(" / ") || `Variação #${v.id}`,
          ativo:
            v.status === "ATIVO" && variacaoAtivaNaEmpresa(v, ctx.idEmpresa),
        })),
        locais: posicoes(locais),
        setores: posicoes(setores),
        excedeu: {
          produto: produtos.length > limite,
          variacao: variacoes.length > limite,
          local: locais.length > limite,
          setor: setores.length > limite,
        },
        permissoes: {
          criar: admin || !!p?.pode_criar,
          editar: admin || !!p?.pode_editar,
          exportar: admin || !!relatorios?.pode_ler,
        },
      }
    },
    { isolationLevel: "RepeatableRead" },
  )
}

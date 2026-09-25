import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type {
  ContextoEstoque,
  PosicaoEstoque,
} from "@/features/estoque-minimo/tipos"
import {
  calcularDeficit,
  classificarPosicao,
  ordenarPosicoes,
} from "@/features/estoque-minimo/regras"
import { EstoqueMinimoError } from "./estoque-minimo.error"
import type { ConfigurarMinimoInput } from "./estoque-minimo.schema"

export async function listarPosicoes(
  contexto: ContextoEstoque,
  somenteInsumos = false,
): Promise<PosicaoEstoque[]> {
  const registros = await prisma.estoque.findMany({
    where: {
      id_empresa: contexto.idEmpresa,
      locais_estoque: { id_empresa: contexto.idEmpresa, status: "ATIVO" },
      produtos: {
        status: "ATIVO",
        controla_estoque: true,
        produto_empresa: {
          some: { id_empresa: contexto.idEmpresa, status: "ATIVO" },
        },
        ...(somenteInsumos
          ? { permite_compra: true, permite_venda: false }
          : {}),
      },
    },
    select: {
      id: true,
      id_local_estoque: true,
      id_produto: true,
      quantidade: true,
      locais_estoque: { select: { nome: true } },
      produtos: {
        select: {
          nome: true,
          codigo: true,
          unidade: true,
          permite_compra: true,
          permite_venda: true,
          tipos_produto: { select: { nome: true } },
          produto_empresa: {
            where: { id_empresa: contexto.idEmpresa, status: "ATIVO" },
            select: {
              estoque_minimo_local: {
                where: { id_empresa: contexto.idEmpresa },
                select: { id_local_estoque: true, quantidade_minima: true },
              },
            },
          },
        },
      },
    },
  })

  return ordenarPosicoes(
    registros.map((registro) => {
      const configuracao =
        registro.produtos.produto_empresa[0]?.estoque_minimo_local.find(
          (item) => item.id_local_estoque === registro.id_local_estoque,
        )
      const quantidade = registro.quantidade.toFixed(3)
      const minimo = configuracao?.quantidade_minima.toFixed(3) ?? null
      return {
        idEstoque: registro.id,
        idProduto: registro.id_produto,
        idLocalEstoque: registro.id_local_estoque,
        produto: registro.produtos.nome,
        codigo: registro.produtos.codigo,
        tipo: registro.produtos.tipos_produto.nome,
        local: registro.locais_estoque.nome,
        unidade: registro.produtos.unidade,
        quantidade,
        minimo,
        deficit: calcularDeficit(quantidade, minimo),
        estado: classificarPosicao(quantidade, minimo),
        ehInsumo:
          registro.produtos.permite_compra && !registro.produtos.permite_venda,
      }
    }),
  )
}

export async function salvarMinimoLocal(
  contexto: ContextoEstoque,
  dados: ConfigurarMinimoInput,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const [local, produto] = await Promise.all([
          tx.locais_estoque.findFirst({
            where: {
              id: dados.idLocalEstoque,
              id_empresa: contexto.idEmpresa,
              status: "ATIVO",
            },
            select: { id: true, nome: true },
          }),
          tx.produto_empresa.findFirst({
            where: {
              id_empresa: contexto.idEmpresa,
              id_produto: dados.idProduto,
              status: "ATIVO",
              produtos: { status: "ATIVO", controla_estoque: true },
            },
            select: { id_produto: true, produtos: { select: { nome: true } } },
          }),
        ])
        if (!local)
          throw new EstoqueMinimoError(
            400,
            "Selecione um local de estoque ativo da empresa.",
          )
        if (!produto)
          throw new EstoqueMinimoError(
            400,
            "Selecione um produto ativo e controlado no estoque da empresa.",
          )

        const chave = {
          id_empresa: contexto.idEmpresa,
          id_local_estoque: dados.idLocalEstoque,
          id_produto: dados.idProduto,
        }
        const anterior = await tx.estoque_minimo_local.findUnique({
          where: { id_empresa_id_local_estoque_id_produto: chave },
        })
        const configuracao = await tx.estoque_minimo_local.upsert({
          where: { id_empresa_id_local_estoque_id_produto: chave },
          create: { ...chave, quantidade_minima: dados.quantidadeMinima },
          update: { quantidade_minima: dados.quantidadeMinima },
        })
        await tx.auditoria.create({
          data: {
            id_empresa: contexto.idEmpresa,
            id_usuario: contexto.idUsuario,
            tabela: "estoque_minimo_local",
            id_registro: configuracao.id,
            acao: anterior ? "UPDATE" : "INSERT",
            dados_anteriores: anterior
              ? JSON.stringify({
                  idLocalEstoque: anterior.id_local_estoque,
                  idProduto: anterior.id_produto,
                  quantidadeMinima: anterior.quantidade_minima.toString(),
                })
              : null,
            dados_novos: JSON.stringify({
              idLocalEstoque: configuracao.id_local_estoque,
              local: local.nome,
              idProduto: configuracao.id_produto,
              produto: produto.produtos.nome,
              quantidadeMinima: configuracao.quantidade_minima.toString(),
            }),
          },
        })
        return {
          id: configuracao.id,
          idProduto: configuracao.id_produto,
          idLocalEstoque: configuracao.id_local_estoque,
          quantidadeMinima: configuracao.quantidade_minima.toFixed(3),
        }
      },
      { isolationLevel: "Serializable" },
    )
  } catch (erro) {
    if (erro instanceof EstoqueMinimoError) throw erro
    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      if (["P2002", "P2034"].includes(erro.code))
        throw new EstoqueMinimoError(
          409,
          "A configuração foi alterada por outra operação. Atualize e tente novamente.",
        )
      if (["P2003", "P2025"].includes(erro.code))
        throw new EstoqueMinimoError(
          409,
          "O local ou produto foi alterado e impede esta configuração.",
        )
    }
    throw erro
  }
}

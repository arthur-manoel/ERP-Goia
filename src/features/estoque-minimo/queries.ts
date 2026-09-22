import "server-only"
import { prisma } from "@/lib/prisma"
import { autorizarEstoque } from "./autorizacao"
import { calcularDeficit, classificarPosicao, ordenarPosicoes } from "./regras"
import type { ContextoEstoque, PosicaoEstoque } from "./tipos"

type OpcoesListagem = { somenteInsumos?: boolean }

export async function listarPosicoesComContexto(
  contexto: ContextoEstoque,
  opcoes: OpcoesListagem = {},
): Promise<PosicaoEstoque[]> {
  const registros = await prisma.estoque.findMany({
    where: {
      id_empresa: contexto.idEmpresa,
      locais_estoque: {
        id_empresa: contexto.idEmpresa,
        status: "ATIVO",
      },
      produtos: {
        status: "ATIVO",
        controla_estoque: true,
        produto_empresa: {
          some: { id_empresa: contexto.idEmpresa, status: "ATIVO" },
        },
        ...(opcoes.somenteInsumos
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
                select: {
                  id_local_estoque: true,
                  quantidade_minima: true,
                },
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

export async function carregarPosicoesEstoque(opcoes: OpcoesListagem = {}) {
  const acesso = await autorizarEstoque("ler")
  const posicoes = await listarPosicoesComContexto(acesso, opcoes)
  return { posicoes, podeEditar: acesso.podeEditar }
}

import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { ResultadoRelatorioProducao } from "@/features/relatorio-producao/tipos"
import type { FiltrosRelatorioProducao } from "./relatorio-producao.schema"

type Linha = {
  idProduto: number
  codigo: string
  produto: string
  unidade: string
  quantidadeRegistrada: Prisma.Decimal
  ordensConcluidas: bigint
}

type Contagem = { produtos: bigint; ordens: bigint }

export async function consultarRelatorioProducao(
  idEmpresa: number,
  filtros: FiltrosRelatorioProducao,
): Promise<ResultadoRelatorioProducao> {
  const escopo = Prisma.sql`
    FROM ordem_producao o
    JOIN ordem_producao_item oi ON oi.id_ordem_producao = o.id
    JOIN produtos p ON p.id = oi.id_produto
    WHERE o.id_empresa = ${idEmpresa}
      AND o.status = 'CONCLUIDA'
      AND o.data_conclusao IS NOT NULL
      AND o.data_conclusao >= CAST(${filtros.data_inicial} AS DATE)
      AND o.data_conclusao < DATE_ADD(CAST(${filtros.data_final} AS DATE), INTERVAL 1 DAY)`
  const deslocamento = (filtros.pagina - 1) * filtros.limite

  return prisma.$transaction(
    async (tx) => {
      const [contagem] = await tx.$queryRaw<Contagem[]>(Prisma.sql`
        SELECT COUNT(DISTINCT oi.id_produto) AS produtos,
          COUNT(DISTINCT o.id) AS ordens
        ${escopo}`)
      const linhas = await tx.$queryRaw<Linha[]>(Prisma.sql`
        SELECT p.id AS idProduto, p.codigo, p.nome AS produto, p.unidade,
          SUM(oi.quantidade_produzida) AS quantidadeRegistrada,
          COUNT(DISTINCT o.id) AS ordensConcluidas
        ${escopo}
        GROUP BY p.id, p.codigo, p.nome, p.unidade
        ORDER BY p.nome ASC, p.id ASC
        LIMIT ${filtros.limite} OFFSET ${deslocamento}`)
      const totalRegistros = Number(contagem.produtos)

      return {
        dados: linhas.map((linha) => ({
          produto: {
            id: linha.idProduto,
            codigo: linha.codigo,
            nome: linha.produto,
            unidade: linha.unidade,
          },
          quantidadeRegistrada: linha.quantidadeRegistrada.toFixed(3),
          ordensConcluidas: Number(linha.ordensConcluidas),
        })),
        paginacao: {
          pagina: filtros.pagina,
          limite: filtros.limite,
          totalRegistros,
          totalPaginas: Math.max(1, Math.ceil(totalRegistros / filtros.limite)),
        },
        resumo: {
          totalProdutos: totalRegistros,
          totalOrdensConcluidas: Number(contagem.ordens),
        },
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
}

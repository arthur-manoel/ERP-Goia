import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { FiltrosRelatorio } from "./relatorio-estoque.schema"

type Saldos = {
  fisica: Prisma.Decimal
  reservada: Prisma.Decimal
  disponivel: Prisma.Decimal
}
type Linha = Saldos & {
  idLocal: number
  local: string
  statusLocal: string
  idProduto: number
  codigo: string
  codigoInterno: string | null
  produto: string
  unidade: string
  statusProduto: string
  statusProdutoEmpresa: string
  atualizadoEm: Date
}
type Contagem = { registros: bigint; produtos: bigint; locais: bigint }
type Grupo = Saldos & { idLocalEstoque: number; unidade: string }

function quantidades(saldo: Saldos) {
  return {
    quantidadeFisica: saldo.fisica.toFixed(3),
    quantidadeReservada: saldo.reservada.toFixed(3),
    quantidadeDisponivel: saldo.disponivel.toFixed(3),
  }
}

export async function consultarRelatorio(
  idEmpresa: number,
  filtros: FiltrosRelatorio,
) {
  const condicoes = [Prisma.sql`e.id_empresa = ${idEmpresa}`]
  if (filtros.id_local_estoque !== undefined)
    condicoes.push(Prisma.sql`e.id_local_estoque = ${filtros.id_local_estoque}`)
  if (filtros.id_produto !== undefined)
    condicoes.push(Prisma.sql`e.id_produto = ${filtros.id_produto}`)
  if (!filtros.incluir_zerados) condicoes.push(Prisma.sql`e.quantidade <> 0`)
  if (filtros.busca)
    condicoes.push(Prisma.sql`(LOCATE(${filtros.busca}, p.nome) > 0
      OR LOCATE(${filtros.busca}, p.codigo) > 0
      OR LOCATE(${filtros.busca}, pe.codigo_interno) > 0)`)

  // Somente relações um-para-um; todos os vínculos pertencem à empresa autorizada.
  const escopo = Prisma.sql`
    FROM estoque e
    JOIN locais_estoque l ON l.id = e.id_local_estoque AND l.id_empresa = e.id_empresa
    JOIN setores s ON s.id = e.id_setor AND s.id_empresa = e.id_empresa
    JOIN produtos p ON p.id = e.id_produto
    JOIN produto_empresa pe ON pe.id_produto = e.id_produto AND pe.id_empresa = e.id_empresa
    WHERE ${Prisma.join(condicoes, " AND ")}`
  const colunas = {
    local: Prisma.sql`l.nome`,
    produto: Prisma.sql`p.nome`,
    quantidade_fisica: Prisma.sql`e.quantidade`,
  }
  const direcao = filtros.direcao === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`
  const deslocamento = (filtros.pagina - 1) * filtros.limite

  // As três leituras compartilham o snapshot InnoDB, sem bloquear saldos para escrita.
  return prisma.$transaction(
    async (tx) => {
      const geradoEm = new Date().toISOString()
      const [contagem] = await tx.$queryRaw<Contagem[]>(Prisma.sql`
      SELECT COUNT(*) AS registros, COUNT(DISTINCT p.id) AS produtos,
        COUNT(DISTINCT l.id) AS locais ${escopo}`)
      const linhas = await tx.$queryRaw<Linha[]>(Prisma.sql`
      SELECT l.id AS idLocal, l.nome AS local, l.status AS statusLocal,
        p.id AS idProduto, p.codigo, pe.codigo_interno AS codigoInterno,
        p.nome AS produto, p.unidade, p.status AS statusProduto,
        pe.status AS statusProdutoEmpresa, e.quantidade AS fisica,
        e.quantidade_reservada AS reservada,
        (e.quantidade - e.quantidade_reservada) AS disponivel,
        e.data_atualizacao AS atualizadoEm
      ${escopo}
      ORDER BY ${colunas[filtros.ordenar_por]} ${direcao}, l.id ASC, p.id ASC, e.id ASC
      LIMIT ${filtros.limite} OFFSET ${deslocamento}`)
      const grupos = await tx.$queryRaw<Grupo[]>(Prisma.sql`
      SELECT l.id AS idLocalEstoque, MIN(p.unidade) AS unidade,
        SUM(e.quantidade) AS fisica, SUM(e.quantidade_reservada) AS reservada,
        (SUM(e.quantidade) - SUM(e.quantidade_reservada)) AS disponivel
      ${escopo}
      GROUP BY l.id, BINARY p.unidade
      ORDER BY l.id, BINARY unidade`)
      const totalRegistros = Number(contagem.registros)
      return {
        geradoEm,
        dados: linhas.map((linha) => ({
          localEstoque: {
            id: linha.idLocal,
            nome: linha.local,
            status: linha.statusLocal,
          },
          produto: {
            id: linha.idProduto,
            codigo: linha.codigo,
            codigoInterno: linha.codigoInterno,
            nome: linha.produto,
            unidade: linha.unidade,
            status: linha.statusProduto,
            statusNaEmpresa: linha.statusProdutoEmpresa,
          },
          ...quantidades(linha),
          atualizadoEm: linha.atualizadoEm.toISOString(),
        })),
        paginacao: {
          pagina: filtros.pagina,
          limite: filtros.limite,
          totalRegistros,
          totalPaginas: Math.ceil(totalRegistros / filtros.limite),
        },
        resumo: {
          totalProdutosDistintos: Number(contagem.produtos),
          totalLocais: Number(contagem.locais),
          porLocalEUnidade: grupos.map((grupo) => ({
            idLocalEstoque: grupo.idLocalEstoque,
            unidade: grupo.unidade,
            ...quantidades(grupo),
          })),
        },
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
}

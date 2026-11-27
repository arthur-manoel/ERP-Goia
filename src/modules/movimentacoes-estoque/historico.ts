import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { conferir, type Contexto, type Tx } from "@/modules/reservas/operacoes"
import {
  calcularPaginacao,
  direcoes,
  type Consulta,
} from "@/modules/kardex/kardex.schema"
import { validarReferencias } from "@/modules/kardex/kardex.repository"

function filtro(idEmpresa: number, f: Consulta) {
  const tipos = Object.entries(direcoes)
    .filter(([, d]) => d === f.direcao)
    .map(([t]) => t)
  const condicoes = [
    Prisma.sql`m.id_empresa = ${idEmpresa}`,
    Prisma.sql`UNIX_TIMESTAMP(m.data_movimentacao) >= ${f.inicio.getTime() / 1000} AND UNIX_TIMESTAMP(m.data_movimentacao) < ${f.fim.getTime() / 1000}`,
  ]
  if (f.idProduto) condicoes.push(Prisma.sql`m.id_produto = ${f.idProduto}`)
  if (f.idLocalEstoque)
    condicoes.push(Prisma.sql`m.id_local_estoque = ${f.idLocalEstoque}`)
  if (f.idSetor) condicoes.push(Prisma.sql`m.id_setor = ${f.idSetor}`)
  if (f.idVariacao) condicoes.push(Prisma.sql`m.id_variacao = ${f.idVariacao}`)
  if (f.idMovimentacao) condicoes.push(Prisma.sql`m.id = ${f.idMovimentacao}`)
  if (f.tipo) condicoes.push(Prisma.sql`m.tipo = ${f.tipo}`)
  if (f.direcao) condicoes.push(Prisma.sql`m.tipo IN (${Prisma.join(tipos)})`)
  if (f.origemTipo) condicoes.push(Prisma.sql`m.origem_tipo = ${f.origemTipo}`)
  if (f.origemId) condicoes.push(Prisma.sql`m.origem_id = ${f.origemId}`)
  return Prisma.join(condicoes, " AND ")
}

export async function lerMovimentos(
  tx: Tx,
  ctx: Contexto,
  f: Consulta,
  limite: number,
  offset: number,
) {
  const linhas = await tx.$queryRaw<
    {
      id: number
      instante: number | bigint | null
      produto: string
      idProduto: number
      unidade: string
      idLocal: number | null
      local: string | null
      idSetor: number | null
      setor: string | null
      idVariacao: number | null
      cor: string | null
      tamanho: string | null
      tipo: keyof typeof direcoes
      quantidade: Prisma.Decimal
      origemTipo: string | null
      origemId: number | null
      observacao: string | null
    }[]
  >`
    SELECT m.id, UNIX_TIMESTAMP(m.data_movimentacao) AS instante,
      p.id AS idProduto, p.nome AS produto, p.unidade,
      l.id AS idLocal, l.nome AS local, s.id AS idSetor, s.nome AS setor,
      v.id AS idVariacao, c.nome AS cor, t.nome AS tamanho, m.tipo, m.quantidade,
      m.origem_tipo AS origemTipo, m.origem_id AS origemId,
      CASE WHEN m.origem_tipo IN ('API_ENTRADA', 'API_SAIDA', 'API_AJUSTE') THEN m.observacao END AS observacao
    FROM movimentacao_estoque m
    JOIN produtos p ON p.id = m.id_produto
    LEFT JOIN locais_estoque l ON l.id = m.id_local_estoque AND l.id_empresa = m.id_empresa
    LEFT JOIN setores s ON s.id = m.id_setor AND s.id_empresa = m.id_empresa
    LEFT JOIN produto_variacoes v ON v.id = m.id_variacao AND v.id_empresa = m.id_empresa AND v.id_produto = m.id_produto
    LEFT JOIN cores c ON c.id = v.id_cor AND (c.id_empresa IS NULL OR c.id_empresa = m.id_empresa)
    LEFT JOIN tamanhos t ON t.id = v.id_tamanho AND (t.id_empresa IS NULL OR t.id_empresa = m.id_empresa)
    WHERE ${filtro(ctx.idEmpresa, f)}
    ORDER BY m.data_movimentacao DESC, m.id DESC
    LIMIT ${limite} OFFSET ${offset}
  `
  return linhas.map((m) => ({
    id: m.id,
    idMovimentacao: m.id,
    dataMovimentacao:
      m.instante === null
        ? null
        : new Date(Number(m.instante) * 1000).toISOString(),
    produto: { id: m.idProduto, nome: m.produto, unidade: m.unidade },
    localEstoque: m.idLocal === null ? null : { id: m.idLocal, nome: m.local },
    setor: m.idSetor === null ? null : { id: m.idSetor, nome: m.setor },
    variacao:
      m.idVariacao === null
        ? null
        : { id: m.idVariacao, cor: m.cor, tamanho: m.tamanho },
    direcao: direcoes[m.tipo],
    tipo: m.tipo,
    quantidade: m.quantidade.toFixed(3),
    origem: m.origemTipo ? { tipo: m.origemTipo, id: m.origemId } : null,
    observacao: m.observacao,
  }))
}

export function consultarMovimentos(ctx: Contexto, f: Consulta) {
  return prisma.$transaction(
    async (tx) => {
      await conferir(tx, ctx, [["ESTOQUE", "ler"]])
      await validarReferencias(tx, ctx.idEmpresa, f, "movimentacoes")
      const [contagem] = await tx.$queryRaw<{ registros: bigint }[]>`
      SELECT COUNT(*) AS registros FROM movimentacao_estoque m WHERE ${filtro(ctx.idEmpresa, f)}`
      const offset = (f.pagina - 1) * f.limite
      const total = Number(contagem.registros)
      return {
        idEmpresa: ctx.idEmpresa,
        periodo: f.periodo,
        dados:
          offset < total
            ? await lerMovimentos(tx, ctx, f, f.limite, offset)
            : [],
        paginacao: calcularPaginacao(f.pagina, f.limite, total),
      }
    },
    { isolationLevel: "RepeatableRead", timeout: 15_000 },
  )
}

import "server-only"
import { Prisma } from "@/generated/prisma/client"
import type { movimentacao_estoque_tipo } from "@/generated/prisma/enums"
import { prisma } from "@/lib/prisma"
import { NotFoundError, ValidationError } from "@/lib/api/errors"
import { conferir } from "@/modules/reservas/operacoes"
import type { Contexto } from "@/modules/movimentacoes-estoque/movimentacoes-estoque.authorization"
import { direcoes, type Consulta } from "./kardex.schema"

type Tx = Prisma.TransactionClient
type Decimal = Prisma.Decimal
type Direcao = "ENTRADA" | "SAIDA"
type Linha = {
  id: number
  idMovimentacao: number | null
  instante: number | bigint
  idProduto: number | null
  produto: string | null
  unidade: string | null
  idLocal: number | null
  nomeLocal: string | null
  idSetor: number | null
  nomeSetor: string | null
  idVariacao: number | null
  cor: string | null
  tamanho: string | null
  direcao: Direcao
  tipo: movimentacao_estoque_tipo | null
  quantidade: Decimal
  saldoAnterior: Decimal
  saldoAtual: Decimal
  valido: number
  origemTipo: string | null
  origemId: number | null
  observacao: string | null
  idMovimentoRelacionado: number | null
  idMovimentoOriginal: number | null
}

const entradas = Object.entries(direcoes)
  .filter(([, d]) => d === "ENTRADA")
  .map(([tipo]) => tipo)
const saidas = Object.entries(direcoes)
  .filter(([, d]) => d === "SAIDA")
  .map(([tipo]) => tipo)
const vinculoMovimento = Prisma.sql`
  m.id = k.id_movimentacao AND m.id_empresa = k.id_empresa
  AND m.id_produto = k.id_produto AND m.id_local_estoque <=> k.id_local_estoque
  AND m.id_setor <=> k.id_setor`
const vinculosLivro = Prisma.sql`
  LEFT JOIN movimentacao_estoque m ON ${vinculoMovimento}
  LEFT JOIN locais_estoque l ON l.id = k.id_local_estoque AND l.id_empresa = k.id_empresa
  LEFT JOIN setores s ON s.id = k.id_setor AND s.id_empresa = k.id_empresa`
const livro = Prisma.sql`FROM kardex k ${vinculosLivro}`
// O driver interpreta valores de TIMESTAMP no fuso da sessão como UTC.
// Trabalhar com segundos Unix mantém filtro, ordem e resposta no instante real.
const instante = Prisma.sql`UNIX_TIMESTAMP(k.data_movimentacao)`
const segundos = (data: Date) => data.getTime() / 1000
const lancamentoValido = Prisma.sql`
  ${instante} > 0 AND m.id IS NOT NULL AND (k.id_local_estoque IS NULL OR l.id IS NOT NULL)
  AND (k.id_setor IS NULL OR s.id IS NOT NULL)
  AND k.quantidade > 0 AND m.quantidade = k.quantidade
  AND k.saldo_anterior >= 0 AND k.saldo_atual >= 0
  AND k.tipo_movimentacao = CASE WHEN m.tipo IN (${Prisma.join(entradas)}) THEN 'ENTRADA'
    WHEN m.tipo IN (${Prisma.join(saidas)}) THEN 'SAIDA' END
  AND k.saldo_atual = k.saldo_anterior
    + CASE WHEN k.tipo_movimentacao = 'ENTRADA' THEN k.quantidade ELSE -k.quantidade END`

async function validarReferencias(tx: Tx, idEmpresa: number, f: Consulta) {
  const [produto, local, setor, variacao] = await Promise.all([
    f.idProduto
      ? tx.produto_empresa.findFirst({
          where: { id_empresa: idEmpresa, id_produto: f.idProduto },
          select: { id: true },
        })
      : true,
    f.idLocalEstoque
      ? tx.locais_estoque.findFirst({
          where: { id_empresa: idEmpresa, id: f.idLocalEstoque },
          select: { id: true },
        })
      : true,
    f.idSetor
      ? tx.setores.findFirst({
          where: { id_empresa: idEmpresa, id: f.idSetor },
          select: { id: true },
        })
      : true,
    f.idVariacao
      ? tx.produto_variacoes.findFirst({
          where: { id_empresa: idEmpresa, id: f.idVariacao },
          select: { id_produto: true },
        })
      : true,
  ])
  if (!produto) {
    const historico = await tx.$queryRaw<{ id: number }[]>`
      SELECT k.id FROM kardex k JOIN movimentacao_estoque m ON ${vinculoMovimento}
      WHERE k.id_empresa = ${idEmpresa} AND k.id_produto = ${f.idProduto} LIMIT 1`
    if (!historico.length)
      throw new NotFoundError("Produto não encontrado na empresa.")
  }
  if (!local || !setor || !variacao)
    throw new NotFoundError("Referência de estoque não encontrada na empresa.")
  if (variacao !== true && f.idProduto && variacao.id_produto !== f.idProduto)
    throw new ValidationError("A variação não pertence ao produto informado.")
}

function filtrosSql(idEmpresa: number, f: Consulta) {
  const filtros = [
    Prisma.sql`k.id_empresa = ${idEmpresa}`,
    Prisma.sql`${instante} >= ${segundos(f.inicio)} AND ${instante} < ${segundos(f.fim)}`,
  ]
  if (f.idProduto) filtros.push(Prisma.sql`k.id_produto = ${f.idProduto}`)
  if (f.idLocalEstoque)
    filtros.push(Prisma.sql`k.id_local_estoque = ${f.idLocalEstoque}`)
  if (f.idSetor) filtros.push(Prisma.sql`k.id_setor = ${f.idSetor}`)
  if (f.idVariacao) filtros.push(Prisma.sql`m.id_variacao = ${f.idVariacao}`)
  if (f.idMovimentacao) filtros.push(Prisma.sql`m.id = ${f.idMovimentacao}`)
  if (f.direcao) filtros.push(Prisma.sql`k.tipo_movimentacao = ${f.direcao}`)
  if (f.tipo) filtros.push(Prisma.sql`m.tipo = ${f.tipo}`)
  if (f.origemTipo) filtros.push(Prisma.sql`m.origem_tipo = ${f.origemTipo}`)
  if (f.origemId) filtros.push(Prisma.sql`m.origem_id = ${f.origemId}`)
  return Prisma.sql`WHERE ${Prisma.join(filtros, " AND ")}`
}

export function consultaPagina(idEmpresa: number, f: Consulta) {
  return Prisma.sql`
    WITH pagina AS (
      SELECT k.id, ${instante} AS instante ${livro}
      ${filtrosSql(idEmpresa, f)}
      ORDER BY instante DESC, k.id DESC
      LIMIT ${f.limite} OFFSET ${(f.pagina - 1) * f.limite}
    )
    SELECT k.id, m.id AS idMovimentacao, pagina.instante,
      CASE WHEN m.id IS NOT NULL OR pe.id IS NOT NULL THEN p.id END AS idProduto,
      CASE WHEN m.id IS NOT NULL OR pe.id IS NOT NULL THEN p.nome END AS produto,
      CASE WHEN m.id IS NOT NULL OR pe.id IS NOT NULL THEN p.unidade END AS unidade,
      l.id AS idLocal, l.nome AS nomeLocal, s.id AS idSetor, s.nome AS nomeSetor,
      v.id AS idVariacao, c.nome AS cor, t.nome AS tamanho,
      k.tipo_movimentacao AS direcao, m.tipo, k.quantidade,
      k.saldo_anterior AS saldoAnterior, k.saldo_atual AS saldoAtual,
      CASE WHEN ${lancamentoValido} THEN 1 ELSE 0 END AS valido,
      m.origem_tipo AS origemTipo, m.origem_id AS origemId,
      CASE WHEN m.origem_tipo IN ('API_ENTRADA', 'API_SAIDA', 'API_AJUSTE')
        THEN m.observacao ELSE NULL END AS observacao,
      contraparte.id AS idMovimentoRelacionado, linha.id_movimento_saida AS idMovimentoOriginal
    FROM pagina
    JOIN kardex k ON k.id = pagina.id
    ${vinculosLivro}
    JOIN produtos p ON p.id = k.id_produto
    LEFT JOIN produto_empresa pe ON pe.id_empresa = k.id_empresa AND pe.id_produto = k.id_produto
    LEFT JOIN produto_variacoes v
      ON v.id = m.id_variacao AND v.id_empresa = m.id_empresa AND v.id_produto = m.id_produto
    LEFT JOIN cores c ON c.id = v.id_cor AND (c.id_empresa IS NULL OR c.id_empresa = m.id_empresa)
    LEFT JOIN tamanhos t ON t.id = v.id_tamanho AND (t.id_empresa IS NULL OR t.id_empresa = m.id_empresa)
    LEFT JOIN transferencia_estoque tr
      ON tr.id = m.origem_id AND tr.id_empresa = m.id_empresa AND tr.id_produto = m.id_produto
      AND ((m.origem_tipo = 'TRANSFERENCIA_ENVIO' AND tr.id_movimento_saida = m.id)
        OR (m.origem_tipo = 'TRANSFERENCIA_RECEBIMENTO' AND tr.id_movimento_entrada = m.id))
    LEFT JOIN pedido_devolucao_destinacao de
      ON de.id_recebimento = m.origem_id AND de.id_empresa = m.id_empresa
      AND m.origem_tipo = 'DEVOLUCAO_PEDIDO' AND de.id_movimento_entrada = m.id
    LEFT JOIN pedido_devolucao_destinacao ds
      ON ds.id_recebimento = m.origem_id AND ds.id_empresa = m.id_empresa
      AND m.origem_tipo = 'DESCARTE_DEVOLUCAO' AND ds.id_movimento_saida = m.id
    LEFT JOIN movimentacao_estoque contraparte
      ON contraparte.id = COALESCE(de.id_movimento_saida, ds.id_movimento_entrada,
        CASE WHEN tr.id_movimento_saida = m.id THEN tr.id_movimento_entrada ELSE tr.id_movimento_saida END)
      AND contraparte.id_empresa = m.id_empresa AND contraparte.id_produto = m.id_produto
      AND contraparte.id_variacao <=> m.id_variacao
    LEFT JOIN pedido_devolucao_recebimento r
      ON r.id = COALESCE(de.id_recebimento, ds.id_recebimento) AND r.id_empresa = m.id_empresa
    LEFT JOIN pedido_devolucao_linha linha ON linha.id = r.id_linha AND linha.id_empresa = r.id_empresa
    ORDER BY pagina.instante DESC, k.id DESC`
}

function apresentar(l: Linha) {
  const valido = Number(l.valido) === 1
  return {
    id: l.id,
    idMovimentacao: l.idMovimentacao,
    dataMovimentacao: new Date(Number(l.instante) * 1000).toISOString(),
    produto:
      l.idProduto === null
        ? null
        : { id: l.idProduto, nome: l.produto, unidade: l.unidade },
    localEstoque:
      l.idLocal === null ? null : { id: l.idLocal, nome: l.nomeLocal },
    setor: l.idSetor === null ? null : { id: l.idSetor, nome: l.nomeSetor },
    variacao:
      l.idVariacao === null
        ? null
        : { id: l.idVariacao, cor: l.cor, tamanho: l.tamanho },
    direcao: l.direcao,
    tipo: l.tipo,
    quantidade: l.idMovimentacao === null ? null : l.quantidade.toFixed(3),
    delta: valido
      ? (l.direcao === "SAIDA" ? l.quantidade.negated() : l.quantidade).toFixed(
          3,
        )
      : null,
    saldo: {
      escopo: "POSICAO_AGREGADA",
      situacao: valido ? "REGISTRADO" : "DIVERGENTE",
      anterior: valido ? l.saldoAnterior.toFixed(3) : null,
      posterior: valido ? l.saldoAtual.toFixed(3) : null,
    },
    origem:
      l.origemTipo === null ? null : { tipo: l.origemTipo, id: l.origemId },
    observacao: l.observacao,
    idMovimentoRelacionado: l.idMovimentoRelacionado,
    idMovimentoOriginal: l.idMovimentoOriginal,
  }
}

type Prova = {
  registros: bigint
  divergencias: Decimal | null
  semVinculo: number
  aberturaNoPeriodo: Decimal | null
  fechamento: Decimal | null
  finalLivro: Decimal | null
  entradas: Decimal
  saidas: Decimal
}

export function consultaProva(idEmpresa: number, f: Consulta, idSetor: number) {
  const inicio = segundos(f.inicio)
  const fim = segundos(f.fim)
  return Prisma.sql`
    WITH cadeia AS (
      SELECT ${instante} AS data, k.tipo_movimentacao AS direcao,
        k.quantidade, k.saldo_anterior, k.saldo_atual,
        LAG(k.saldo_atual) OVER cronologia AS saldo_previo,
        LAG(${instante}) OVER cronologia AS data_previa,
        LEAD(${instante}) OVER cronologia AS proxima_data,
        CASE WHEN ${lancamentoValido} AND s.id = ${idSetor} THEN 1 ELSE 0 END AS valido
      ${livro}
      WHERE k.id_empresa = ${idEmpresa} AND k.id_produto = ${f.idProduto}
        AND k.id_local_estoque = ${f.idLocalEstoque}
      WINDOW cronologia AS (ORDER BY ${instante}, k.id)
    )
    SELECT COUNT(*) AS registros,
      SUM(CASE WHEN valido = 0 OR saldo_anterior <> COALESCE(saldo_previo, 0) THEN 1 ELSE 0 END) AS divergencias,
      EXISTS (
        SELECT 1 FROM movimentacao_estoque m
        LEFT JOIN kardex k ON ${vinculoMovimento}
        WHERE m.id_empresa = ${idEmpresa} AND m.id_produto = ${f.idProduto}
          AND (m.id_local_estoque IS NULL OR (m.id_local_estoque = ${f.idLocalEstoque} AND k.id IS NULL))
      ) OR EXISTS (
        SELECT 1 FROM kardex k WHERE k.id_empresa = ${idEmpresa}
          AND k.id_produto = ${f.idProduto} AND k.id_local_estoque IS NULL
      ) AS semVinculo,
      MAX(CASE WHEN data >= ${inicio} AND data < ${fim}
        AND (data_previa IS NULL OR data_previa < ${inicio})
        THEN saldo_anterior END) AS aberturaNoPeriodo,
      MAX(CASE WHEN data < ${fim} AND (proxima_data IS NULL OR proxima_data >= ${fim})
        THEN saldo_atual END) AS fechamento,
      MAX(CASE WHEN proxima_data IS NULL THEN saldo_atual END) AS finalLivro,
      COALESCE(SUM(CASE WHEN direcao = 'ENTRADA' AND data >= ${inicio} AND data < ${fim}
        THEN quantidade ELSE 0 END), 0) AS entradas,
      COALESCE(SUM(CASE WHEN direcao = 'SAIDA' AND data >= ${inicio} AND data < ${fim}
        THEN quantidade ELSE 0 END), 0) AS saidas
    FROM cadeia`
}

async function resumir(tx: Tx, idEmpresa: number, f: Consulta) {
  if (!f.idProduto || !f.idLocalEstoque)
    return {
      situacao: "SEM_ESCOPO",
      motivo: "INFORME_PRODUTO_E_LOCAL",
      saldos: null,
    }
  const posicao = {
    idEmpresa,
    idProduto: f.idProduto,
    idLocalEstoque: f.idLocalEstoque,
    idSetor: f.idSetor ?? null,
  }
  const escopo = { escopo: "POSICAO_AGREGADA", posicao }
  const estoque = await tx.estoque.findFirst({
    where: {
      id_empresa: idEmpresa,
      id_produto: f.idProduto,
      id_local_estoque: f.idLocalEstoque,
      setores: { id_empresa: idEmpresa },
    },
    select: {
      quantidade: true,
      id_setor: true,
      produtos: { select: { unidade: true } },
    },
  })
  if (!estoque || (f.idSetor && f.idSetor !== estoque.id_setor))
    return {
      ...escopo,
      situacao: "INDISPONIVEL",
      motivo: "POSICAO_NAO_COMPROVADA",
      saldos: null,
    }
  posicao.idSetor = estoque.id_setor
  const [prova] = await tx.$queryRaw<Prova[]>(
    consultaProva(idEmpresa, f, estoque.id_setor),
  )
  const motivo = Number(prova.semVinculo)
    ? "VINCULO_OU_POSICAO_INCOMPLETA"
    : Number(prova.registros) === 0
      ? "SEM_LANCAMENTOS"
      : Number(prova.divergencias)
        ? "CADEIA_DIVERGENTE"
        : !prova.finalLivro?.equals(estoque.quantidade)
          ? "PROJECAO_DIVERGENTE"
          : !prova.fechamento
            ? "PERIODO_ANTERIOR_AO_HISTORICO"
            : null
  if (motivo || !prova.fechamento)
    return { ...escopo, situacao: "INDISPONIVEL", motivo, saldos: null }
  return {
    ...escopo,
    situacao: "COMPROVADO",
    motivo: null,
    unidade: estoque.produtos.unidade,
    saldos: {
      abertura: (prova.aberturaNoPeriodo ?? prova.fechamento).toFixed(3),
      entradas: prova.entradas.toFixed(3),
      saidas: prova.saidas.toFixed(3),
      fechamento: prova.fechamento.toFixed(3),
    },
  }
}

export function consultarKardex(ctx: Contexto, f: Consulta) {
  return prisma.$transaction(
    async (tx) => {
      await conferir(tx, ctx, [["ESTOQUE", "ler"]])
      await validarReferencias(tx, ctx.idEmpresa, f)
      const [total] = await tx.$queryRaw<{ registros: bigint }[]>`
      SELECT COUNT(*) AS registros ${livro} ${filtrosSql(ctx.idEmpresa, f)}`
      const totalRegistros = Number(total.registros)
      const linhas =
        (f.pagina - 1) * f.limite < totalRegistros
          ? await tx.$queryRaw<Linha[]>(consultaPagina(ctx.idEmpresa, f))
          : []
      return {
        idEmpresa: ctx.idEmpresa,
        periodo: f.periodo,
        dados: linhas.map(apresentar),
        paginacao: {
          pagina: f.pagina,
          limite: f.limite,
          totalRegistros,
          totalPaginas: Math.ceil(totalRegistros / f.limite),
        },
        resumo: await resumir(tx, ctx.idEmpresa, f),
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  )
}

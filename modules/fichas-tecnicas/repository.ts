import "server-only"
import { ValidationError } from "../../src/lib/api/errors"
import { serializarJsonTextMysql } from "../../src/lib/limites-texto"
import { Prisma } from "../../src/generated/prisma/client"
import { prisma } from "../../src/lib/prisma"
import type { SalvarFichaInput } from "./schema"

export type Database = Prisma.TransactionClient

const fichaInclude = {
  ficha_tecnica_item: {
    orderBy: { id: "asc" as const },
    select: {
      id_produto_componente: true,
      quantidade: true,
      perda_percentual: true,
    },
  },
} satisfies Prisma.ficha_tecnicaInclude

export type FichaComItens = Prisma.ficha_tecnicaGetPayload<{
  include: typeof fichaInclude
}>

export function produtoAcessivel(
  tx: Database = prisma,
  idEmpresa: number,
  idProduto: number,
) {
  return tx.produto_empresa.findFirst({
    where: { id_empresa: idEmpresa, id_produto: idProduto },
    select: { id_produto: true },
  })
}

export function bloquearProdutos(
  tx: Database,
  idEmpresa: number,
  ids: number[],
) {
  return tx.$queryRaw<Array<{ id: number }>>`
    SELECT p.id FROM produtos p
    INNER JOIN produto_empresa pe ON pe.id_produto = p.id
    WHERE pe.id_empresa = ${idEmpresa}
      AND p.id IN (${Prisma.join([...new Set(ids)].sort((a, b) => a - b))})
    ORDER BY p.id FOR UPDATE
  `
}

export function produtoFabricavelAtivo(
  tx: Database,
  idEmpresa: number,
  idProduto: number,
) {
  return tx.produto_empresa.findFirst({
    where: {
      id_empresa: idEmpresa,
      id_produto: idProduto,
      status: "ATIVO",
      produtos: { status: "ATIVO", permite_producao: true },
    },
    select: { id_produto: true },
  })
}

export function contarComponentesElegiveis(
  tx: Database,
  idEmpresa: number,
  ids: number[],
) {
  return tx.produto_empresa.count({
    where: {
      id_empresa: idEmpresa,
      id_produto: { in: ids },
      status: "ATIVO",
      produtos: { status: "ATIVO", controla_estoque: true },
    },
  })
}

export function fichaAtiva(
  idEmpresa: number,
  idProduto: number,
  tx: Database = prisma,
) {
  return tx.ficha_tecnica.findFirst({
    where: {
      id_empresa: idEmpresa,
      id_produto: idProduto,
      status: "ATIVA",
      OR: [{ data_vigencia: null }, { data_vigencia: { lte: new Date() } }],
    },
    orderBy: { versao: "desc" },
    include: fichaInclude,
  })
}

export function leitura<T>(operation: (tx: Database) => Promise<T>) {
  return prisma.$transaction(operation, {
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  })
}

export function versaoMaisAlta(
  tx: Database,
  idEmpresa: number,
  idProduto: number,
) {
  return tx.ficha_tecnica.aggregate({
    where: { id_empresa: idEmpresa, id_produto: idProduto },
    _max: { versao: true },
  })
}

export function inativarAtivas(
  tx: Database,
  idEmpresa: number,
  idProduto: number,
) {
  return tx.ficha_tecnica.updateMany({
    where: { id_empresa: idEmpresa, id_produto: idProduto, status: "ATIVA" },
    data: { status: "INATIVA" },
  })
}

export function criarVersao(
  tx: Database,
  idEmpresa: number,
  input: SalvarFichaInput,
  versao: number,
  dataVigencia: Date,
) {
  return tx.ficha_tecnica.create({
    data: {
      id_empresa: idEmpresa,
      id_produto: input.id_produto,
      versao,
      status: "ATIVA",
      data_vigencia: dataVigencia,
      ficha_tecnica_item: {
        create: input.itens.map((item) => ({
          id_produto_componente: item.id_produto_componente,
          quantidade: new Prisma.Decimal(item.quantidade),
          perda_percentual: new Prisma.Decimal("0"),
        })),
      },
    },
    include: fichaInclude,
  })
}

export function auditar(
  tx: Database,
  ctx: { idUsuario: number; idEmpresa: number },
  anterior: FichaComItens | null,
  nova: FichaComItens,
) {
  const snapshot = (ficha: FichaComItens) =>
    serializarJsonTextMysql(ficha, (message) => new ValidationError(message))
  return tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela: "ficha_tecnica",
      id_registro: nova.id,
      acao: "INSERT",
      dados_anteriores: anterior ? snapshot(anterior) : null,
      dados_novos: snapshot(nova),
    },
  })
}

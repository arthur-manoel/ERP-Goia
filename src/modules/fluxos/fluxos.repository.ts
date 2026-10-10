import "server-only"
import { Prisma } from "@/generated/prisma/client"
import {
  ProducaoError,
  type Contexto,
  type Transaction,
} from "../producao/producao.repository"
import type { Cadastro, Listagem } from "./fluxos.schema"

export type Entidade = "setor" | "fluxo"
export type Registro = {
  id: number
  nome: string
  descricao: string | null
  status: "ATIVO" | "INATIVO"
  createdAt: Date
  updatedAt: Date
}
export type SetorOrdenado = Registro & { ordem: number }
export type Fluxo = Registro & { setores: SetorOrdenado[] }
export type Etapa = {
  id: number
  id_setor: number
  ordem: number
  status: "PENDENTE" | "EM_PRODUCAO" | "CONCLUIDA"
  data_inicio: Date | null
  data_conclusao: Date | null
}
export type Snapshot = {
  fluxoId: number
  nome: string
  descricao: string | null
  setores: Array<{
    id: number
    nome: string
    descricao: string | null
    ordem: number
  }>
}
// Identificadores vêm exclusivamente desta enumeração interna. Valores usam binds Prisma.
const tabela = (tipo: Entidade) =>
  tipo === "setor" ? Prisma.sql`setores` : Prisma.sql`fluxos_producao`
const colunas = Prisma.sql`id, nome, descricao, status, data_cadastro AS createdAt, data_atualizacao AS updatedAt`
export async function buscar(
  tx: Transaction,
  ctx: Contexto,
  tipo: Entidade,
  id: number,
) {
  const rows = await tx.$queryRaw<Registro[]>(
    Prisma.sql`SELECT ${colunas} FROM ${tabela(tipo)} WHERE id = ${id} AND id_empresa = ${ctx.idEmpresa} FOR UPDATE`,
  )
  if (!rows[0])
    throw new ProducaoError(
      404,
      tipo === "setor" ? "Setor não encontrado." : "Fluxo não encontrado.",
    )
  return rows[0]
}
export async function listar(
  tx: Transaction,
  ctx: Contexto,
  tipo: Entidade,
  input: Listagem,
) {
  const where = Prisma.sql`id_empresa = ${ctx.idEmpresa}
    ${input.nome ? Prisma.sql`AND LOCATE(${input.nome}, nome) > 0` : Prisma.empty}
    ${input.status ? Prisma.sql`AND status = ${input.status}` : Prisma.empty}`
  const rows = await tx.$queryRaw<Registro[]>(
    Prisma.sql`SELECT ${colunas} FROM ${tabela(tipo)} WHERE ${where} ORDER BY nome, id LIMIT ${input.limite} OFFSET ${(input.pagina - 1) * input.limite}`,
  )
  const [count] = await tx.$queryRaw<Array<{ total: bigint }>>(
    Prisma.sql`SELECT COUNT(*) AS total FROM ${tabela(tipo)} WHERE ${where}`,
  )
  return { rows, total: Number(count.total) }
}
export async function gravar(
  tx: Transaction,
  ctx: Contexto,
  tipo: Entidade,
  input: Cadastro,
  id?: number,
) {
  const status = input.ativo === false ? "INATIVO" : "ATIVO"
  if (id !== undefined) {
    await tx.$executeRaw(
      Prisma.sql`UPDATE ${tabela(tipo)} SET nome = ${input.nome}, descricao = ${input.descricao ?? null}, status = ${status}, data_atualizacao = CURRENT_TIMESTAMP(3) WHERE id = ${id} AND id_empresa = ${ctx.idEmpresa}`,
    )
    return id
  }
  await tx.$executeRaw(
    Prisma.sql`INSERT INTO ${tabela(tipo)} (id_empresa, nome, descricao, status) VALUES (${ctx.idEmpresa}, ${input.nome}, ${input.descricao ?? null}, ${status})`,
  )
  const [row] = await tx.$queryRaw<
    Array<{ id: bigint }>
  >`SELECT LAST_INSERT_ID() AS id`
  return Number(row.id)
}
export async function setoresFluxo(tx: Transaction, ctx: Contexto, id: number) {
  return tx.$queryRaw<SetorOrdenado[]>(
    Prisma.sql`SELECT s.id, s.nome, s.descricao, s.status, s.data_cadastro AS createdAt, s.data_atualizacao AS updatedAt, fs.ordem FROM fluxo_producao_setor fs JOIN setores s ON s.id = fs.id_setor WHERE fs.id_fluxo = ${id} AND s.id_empresa = ${ctx.idEmpresa} ORDER BY fs.ordem`,
  )
}
export async function substituirSetores(
  tx: Transaction,
  fluxoId: number,
  ids: number[],
) {
  await tx.$executeRaw`DELETE FROM fluxo_producao_setor WHERE id_fluxo = ${fluxoId}`
  await tx.$executeRaw(
    Prisma.sql`INSERT INTO fluxo_producao_setor (id_fluxo, id_setor, ordem) VALUES ${Prisma.join(ids.map((id, index) => Prisma.sql`(${fluxoId}, ${id}, ${index + 1})`))}`,
  )
}
export async function remover(
  tx: Transaction,
  ctx: Contexto,
  tipo: Entidade,
  id: number,
) {
  await tx.$executeRaw(
    Prisma.sql`DELETE FROM ${tabela(tipo)} WHERE id = ${id} AND id_empresa = ${ctx.idEmpresa}`,
  )
}
export async function emUso(tx: Transaction, tipo: Entidade, id: number) {
  const rows =
    tipo === "setor"
      ? await tx.$queryRaw<
          Array<{ id: number }>
        >`SELECT id_fluxo AS id FROM fluxo_producao_setor WHERE id_setor = ${id} LIMIT 1`
      : await tx.$queryRaw<
          Array<{ id: number }>
        >`SELECT o.id FROM ordem_producao_snapshot s JOIN ordem_producao o ON o.id = s.id_ordem_producao WHERE s.id_fluxo = ${id} AND o.status NOT IN ('CONCLUIDA', 'CANCELADA') LIMIT 1`
  return rows.length > 0
}
export async function produto(tx: Transaction, ctx: Contexto, id: number) {
  const row = await tx.produto_empresa.findUnique({
    where: {
      id_empresa_id_produto: { id_empresa: ctx.idEmpresa, id_produto: id },
    },
  })
  if (!row)
    throw new ProducaoError(404, "Produto não encontrado nesta empresa.")
  return row
}
export async function associar(
  tx: Transaction,
  ctx: Contexto,
  id: number,
  fluxoId: number | null,
) {
  await tx.$executeRaw`DELETE FROM produto_fluxo WHERE id_empresa = ${ctx.idEmpresa} AND id_produto = ${id}`
  if (fluxoId !== null)
    await tx.$executeRaw`INSERT INTO produto_fluxo (id_empresa, id_produto, id_fluxo) VALUES (${ctx.idEmpresa}, ${id}, ${fluxoId})`
}
export async function fluxoProduto(
  tx: Transaction,
  ctx: Contexto,
  id: number,
): Promise<Fluxo> {
  const fluxoId = await associacao(tx, ctx, id)
  if (fluxoId === null)
    throw new ProducaoError(
      422,
      "O produto não possui fluxo de produção associado.",
    )
  return {
    ...(await buscar(tx, ctx, "fluxo", fluxoId)),
    setores: await setoresFluxo(tx, ctx, fluxoId),
  }
}
export async function gravarSnapshot(
  tx: Transaction,
  id: number,
  fluxo: Fluxo,
) {
  const snapshot: Snapshot = {
    fluxoId: fluxo.id,
    nome: fluxo.nome,
    descricao: fluxo.descricao,
    setores: fluxo.setores.map((s) => ({
      id: s.id,
      nome: s.nome,
      descricao: s.descricao,
      ordem: s.ordem,
    })),
  }
  await tx.$executeRaw`INSERT INTO ordem_producao_snapshot (id_ordem_producao, id_fluxo, snapshot) VALUES (${id}, ${fluxo.id}, ${JSON.stringify(snapshot)})`
}
export async function snapshot(tx: Transaction, id: number) {
  const [row] = await tx.$queryRaw<
    Array<{ snapshot: string | Snapshot }>
  >`SELECT snapshot FROM ordem_producao_snapshot WHERE id_ordem_producao = ${id}`
  if (!row) return null
  return typeof row.snapshot === "string"
    ? (JSON.parse(row.snapshot) as Snapshot)
    : row.snapshot
}
export function etapas(tx: Transaction, id: number) {
  return tx.$queryRaw<
    Etapa[]
  >`SELECT id, id_setor, ordem, status, data_inicio, data_conclusao FROM ordem_producao_fluxo_setor WHERE id_ordem_producao = ${id} ORDER BY ordem FOR UPDATE`
}
export async function transicionarEtapa(
  tx: Transaction,
  idOrdem: number,
  etapa: Etapa,
  iniciar: boolean,
) {
  const count = iniciar
    ? await tx.$executeRaw`UPDATE ordem_producao_fluxo_setor SET status = 'EM_PRODUCAO', data_inicio = CURRENT_TIMESTAMP(3) WHERE id = ${etapa.id} AND id_ordem_producao = ${idOrdem} AND status = 'PENDENTE'`
    : await tx.$executeRaw`UPDATE ordem_producao_fluxo_setor SET status = 'CONCLUIDA', data_conclusao = CURRENT_TIMESTAMP(3) WHERE id = ${etapa.id} AND id_ordem_producao = ${idOrdem} AND status = 'EM_PRODUCAO'`
  if (count !== 1)
    throw new ProducaoError(409, "A etapa foi alterada por outra operação.")
}

export async function associacao(
  tx: Transaction,
  ctx: Contexto,
  idProduto: number,
) {
  const [row] = await tx.$queryRaw<
    Array<{ id_fluxo: number }>
  >`SELECT id_fluxo FROM produto_fluxo WHERE id_empresa = ${ctx.idEmpresa} AND id_produto = ${idProduto} FOR UPDATE`
  return row?.id_fluxo ?? null
}
export function produtosDoFluxo(
  tx: Transaction,
  ctx: Contexto,
  idFluxo: number,
) {
  return tx.$queryRaw<
    Array<{ id_produto: number; id_produto_empresa: number }>
  >`SELECT pf.id_produto, pe.id AS id_produto_empresa FROM produto_fluxo pf JOIN produto_empresa pe ON pe.id_empresa = pf.id_empresa AND pe.id_produto = pf.id_produto WHERE pf.id_empresa = ${ctx.idEmpresa} AND pf.id_fluxo = ${idFluxo} ORDER BY pf.id_produto FOR UPDATE`
}
export function auditarCadastro(
  tx: Transaction,
  ctx: Contexto,
  tabela: "setores" | "fluxos_producao" | "produto_fluxo",
  id: number,
  antes: unknown,
  depois: unknown,
) {
  return tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela,
      id_registro: id,
      acao: antes === null ? "INSERT" : depois === null ? "DELETE" : "UPDATE",
      dados_anteriores: antes === null ? null : JSON.stringify(antes),
      dados_novos: depois === null ? null : JSON.stringify(depois),
    },
  })
}

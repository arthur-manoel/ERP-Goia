import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { serializarJsonTextMysql } from "@/lib/limites-texto"
import { ValidationError } from "@/lib/api/errors"
import { vinculoCatalogo, type Action } from "../catalogos/repository"
import { userInclude } from "@/modules/auth/auth.prisma-adapter"
import type { Alteracao, Filtros, Paginacao } from "./schema"

export type Tx = Prisma.TransactionClient
export type Contexto = {
  idUsuario: number
  idEmpresa: number
  ip?: string
  agente?: string
  requisicao?: string
}
export type Cargo = Prisma.cargosGetPayload<{ select: typeof campos }>
const campos = {
  id: true,
  id_empresa: true,
  nome: true,
  descricao: true,
  status: true,
  aprova_cancelamento: true,
} satisfies Prisma.cargosSelect

export function transacao<T>(
  executar: (tx: Tx) => Promise<T>,
  escrita = false,
) {
  return prisma.$transaction(executar, {
    isolationLevel: escrita ? "Serializable" : "RepeatableRead",
    timeout: 15_000,
  })
}
export function acesso(tx: Tx, ctx: Contexto, acao: Action) {
  return tx.usuario_empresa.findFirst({
    where: {
      ...vinculoCatalogo(ctx.idUsuario, "CARGOS", [acao]),
      id_empresa: ctx.idEmpresa,
      cargos: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
    },
    select: {
      nivel_acesso: true,
      usuarios: { select: { nivel_acesso: true } },
    },
  })
}
export function bloquear(tx: Tx, idEmpresa: number, id: number) {
  return tx.$queryRaw`SELECT id FROM cargos WHERE id_empresa = ${idEmpresa} AND id = ${id} FOR UPDATE`
}
export function findById(tx: Tx, idEmpresa: number, id: number) {
  return tx.cargos.findFirst({
    where: { id, id_empresa: idEmpresa },
    select: campos,
  })
}
export function findByNome(
  tx: Tx,
  idEmpresa: number,
  nome: string,
  excluir?: number,
) {
  return tx.cargos.findFirst({
    where: {
      id_empresa: idEmpresa,
      nome,
      id: excluir === undefined ? undefined : { not: excluir },
    },
    select: { id: true },
  })
}
const contem = (termo: string) => ({
  contains: termo.replace(/[\\%_]/g, "\\$&"),
})
export function filtros(
  idEmpresa: number,
  input: Filtros,
): Prisma.cargosWhereInput {
  return {
    id_empresa: idEmpresa,
    id: input.id,
    status: input.status,
    aprova_cancelamento: input.aprova_cancelamento,
    nome: input.nome ? contem(input.nome) : undefined,
    descricao: input.descricao ? contem(input.descricao) : undefined,
    OR: input.search
      ? [{ nome: contem(input.search) }, { descricao: contem(input.search) }]
      : undefined,
  }
}
export function findAll(
  tx: Tx,
  where: Prisma.cargosWhereInput,
  f: Filtros,
  idEmpresa: number,
) {
  return tx.cargos.findMany({
    where,
    skip: (f.page - 1) * f.limit,
    take: f.limit,
    orderBy: [
      { [f.sortBy]: f.sortOrder },
      ...(f.sortBy === "id" ? [] : [{ id: "asc" as const }]),
    ],
    select: {
      ...campos,
      _count: {
        select: { usuario_empresa: { where: { id_empresa: idEmpresa } } },
      },
    },
  })
}
export function count(tx: Tx, where: Prisma.cargosWhereInput) {
  return tx.cargos.count({ where })
}
export function countByEmpresa(tx: Tx, idEmpresa: number) {
  return count(tx, { id_empresa: idEmpresa })
}
export function create(tx: Tx, data: Prisma.cargosUncheckedCreateInput) {
  return tx.cargos.create({ data, select: campos })
}
export function update(
  tx: Tx,
  cargo: Cargo,
  data: Alteracao & { status?: Cargo["status"] },
) {
  return tx.cargos.update({
    where: { id: cargo.id, id_empresa: cargo.id_empresa },
    data,
    select: campos,
  })
}
export const patch = update
export const inactivate = (tx: Tx, cargo: Cargo) =>
  update(tx, cargo, { status: "INATIVO" })
export const activate = (tx: Tx, cargo: Cargo) =>
  update(tx, cargo, { status: "ATIVO" })
function vinculos(
  cargo: Cargo,
  ativos = false,
): Prisma.usuario_empresaWhereInput {
  return {
    id_empresa: cargo.id_empresa,
    id_cargo: cargo.id,
    ...(ativos ? { status: "ATIVO" } : {}),
  }
}
export function countUsuarios(tx: Tx, cargo: Cargo, ativos = false) {
  return tx.usuario_empresa.count({ where: vinculos(cargo, ativos) })
}
export function findUsuariosVinculados(tx: Tx, cargo: Cargo, p: Paginacao) {
  return tx.usuario_empresa.findMany({
    where: vinculos(cargo),
    skip: (p.page - 1) * p.limit,
    take: p.limit,
    orderBy: { id: "asc" },
    select: {
      id_usuario: true,
      status: true,
      data_vinculo: true,
      usuarios: { select: { nome: true, status: true } },
    },
  })
}
export function perfisAfetados(tx: Tx, cargo: Cargo) {
  return tx.usuarios.findMany({
    where: {
      status: "ATIVO",
      usuario_empresa: { some: vinculos(cargo, true) },
    },
    include: userInclude,
  })
}
const escopoAuditoria = (cargo: Cargo) => ({
  id_empresa: cargo.id_empresa,
  tabela: "cargos",
  id_registro: cargo.id,
})
export function ultimaRevisao(tx: Tx, cargo: Cargo) {
  return tx.auditoria.findFirst({
    where: escopoAuditoria(cargo),
    orderBy: { id: "desc" },
    select: { id: true },
  })
}
export function historico(tx: Tx, cargo: Cargo, p: Paginacao) {
  const where = escopoAuditoria(cargo)
  return Promise.all([
    tx.auditoria.findMany({
      where,
      skip: (p.page - 1) * p.limit,
      take: p.limit,
      orderBy: { id: "desc" },
      select: {
        id: true,
        id_usuario: true,
        acao: true,
        data_evento: true,
        dados_anteriores: true,
        dados_novos: true,
      },
    }),
    tx.auditoria.count({ where }),
  ])
}
export async function auditar(
  tx: Tx,
  ctx: Contexto,
  evento: string,
  antes: Cargo | null,
  depois: Cargo,
) {
  const serializar = (v: unknown) =>
    serializarJsonTextMysql(v, (m) => new ValidationError(m))
  return tx.auditoria.create({
    data: {
      ...escopoAuditoria(depois),
      id_usuario: ctx.idUsuario,
      acao: antes ? "UPDATE" : "INSERT",
      ip: ctx.ip,
      dados_anteriores: antes ? serializar(antes) : null,
      dados_novos: serializar({
        ...depois,
        evento,
        user_agent: ctx.agente,
        request_id: ctx.requisicao,
      }),
    },
    select: { id: true },
  })
}

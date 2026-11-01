import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { withCompanyWriteLock } from "../../../modules/catalogos/transactions"
import { serializarJsonTextMysql } from "@/lib/limites-texto"
import { ValidationError } from "@/lib/api/errors"
import type {
  CreateInput,
  PatchInput,
  Filters,
  SupplierFilters,
} from "./schema"
export type Contexto = { idEmpresa: number; idUsuario: number }
export type Database = Prisma.TransactionClient
export const supplierSelect = {
  id: true,
  id_empresa: true,
  razao_social: true,
  nome_fantasia: true,
  cnpj: true,
  status: true,
} satisfies Prisma.fornecedoresSelect
const include = {
  fornecedores: { select: supplierSelect },
} satisfies Prisma.empresa_fornecedorInclude
export function write<T>(
  ctx: Contexto,
  operation: (tx: Database) => Promise<T>,
) {
  return withCompanyWriteLock([ctx.idEmpresa], operation)
}
export function read<T>(operation: (tx: Database) => Promise<T>) {
  return prisma.$transaction(operation, { isolationLevel: "RepeatableRead" })
}
const scope = (ctx: Contexto): Prisma.empresa_fornecedorWhereInput => ({
  id_empresa: ctx.idEmpresa,
  fornecedores: { id_empresa: null },
})
function supplierSearch(input: {
  busca?: string
  nome?: string
  cnpj?: string
}): Prisma.fornecedoresWhereInput {
  const cnpj = input.cnpj?.replace(/[./-]/g, "").toUpperCase()
  const document = (value: string) => {
    const normalized = value.replace(/[./-]/g, "").toUpperCase()
    const formatted = normalized.replace(
      /^(.{2})(.{3})(.{3})(.{4})(.{2})$/,
      "$1.$2.$3/$4-$5",
    )
    return {
      OR: [
        { cnpj: { contains: value } },
        ...(normalized
          ? [
              { cnpj: { contains: normalized } },
              { cnpj: { contains: formatted } },
            ]
          : []),
      ],
    }
  }
  return {
    AND: [
      input.nome
        ? {
            OR: [
              { razao_social: { contains: input.nome } },
              { nome_fantasia: { contains: input.nome } },
            ],
          }
        : {},
      cnpj ? document(input.cnpj!) : {},
      input.busca
        ? {
            OR: [
              { razao_social: { contains: input.busca } },
              { nome_fantasia: { contains: input.busca } },
              document(input.busca),
            ],
          }
        : {},
    ],
  }
}
function where(
  ctx: Contexto,
  filters: Filters,
): Prisma.empresa_fornecedorWhereInput {
  return {
    AND: [
      scope(ctx),
      {
        id_fornecedor: filters.id_fornecedor,
        status: filters.status,
        fornecedores: supplierSearch(filters),
      },
    ],
  }
}
export function findById(ctx: Contexto, id: number, tx: Database = prisma) {
  return tx.empresa_fornecedor.findFirst({
    where: { AND: [scope(ctx), { id }] },
    include,
  })
}
export function findByEmpresaFornecedor(
  ctx: Contexto,
  idFornecedor: number,
  tx: Database,
) {
  return tx.empresa_fornecedor.findFirst({
    where: { AND: [scope(ctx), { id_fornecedor: idFornecedor }] },
    include,
  })
}
export async function findGlobalSupplier(id: number, tx: Database) {
  const rows = await tx.$queryRaw<
    Array<{ id: number }>
  >`SELECT id FROM fornecedores WHERE id = ${id} AND id_empresa IS NULL FOR UPDATE`
  return rows.length
    ? tx.fornecedores.findFirst({
        where: { id, id_empresa: null },
        select: supplierSelect,
      })
    : null
}
export function create(ctx: Contexto, data: CreateInput, tx: Database) {
  return tx.empresa_fornecedor.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_fornecedor: data.id_fornecedor,
      prazo_pagamento: data.prazo_pagamento ?? null,
      prazo_entrega: data.prazo_entrega ?? null,
      observacao: data.observacao ?? null,
      status: "ATIVO",
    },
    include,
  })
}
export function update(
  ctx: Contexto,
  id: number,
  data: PatchInput,
  tx: Database,
) {
  return tx.empresa_fornecedor.update({
    where: { ...scope(ctx), id },
    data,
    include,
  })
}
export const patch = update
export function activate(
  ctx: Contexto,
  id: number,
  data: PatchInput,
  tx: Database,
) {
  return update(ctx, id, { ...data, status: "ATIVO" }, tx)
}
export function inactivate(ctx: Contexto, id: number, tx: Database) {
  return update(ctx, id, { status: "INATIVO" }, tx)
}
export function count(ctx: Contexto, filters: Filters, tx: Database = prisma) {
  return tx.empresa_fornecedor.count({ where: where(ctx, filters) })
}
export async function findAll(ctx: Contexto, filters: Filters) {
  const orderBy: Prisma.empresa_fornecedorOrderByWithRelationInput[] = [
    filters.ordenar_por === "fornecedor"
      ? { fornecedores: { razao_social: filters.ordem } }
      : { [filters.ordenar_por]: filters.ordem },
    ...(filters.ordenar_por === "id" ? [] : [{ id: "asc" as const }]),
  ]
  return read(async (tx) => {
    const [rows, count] = await Promise.all([
      tx.empresa_fornecedor.findMany({
        where: where(ctx, filters),
        include,
        orderBy,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tx.empresa_fornecedor.count({ where: where(ctx, filters) }),
    ])
    return { rows, count }
  })
}
export function availableSuppliers(ctx: Contexto, filters: SupplierFilters) {
  const where: Prisma.fornecedoresWhereInput = {
    AND: [
      { status: "ATIVO" },
      filters.tipo === "ESPECIFICO"
        ? { id_empresa: ctx.idEmpresa }
        : {
            id_empresa: null,
            empresa_fornecedor: {
              none: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
            },
          },
      supplierSearch(filters),
    ],
  }
  return read(async (tx) => {
    const [rows, count] = await Promise.all([
      tx.fornecedores.findMany({
        where,
        select: {
          ...supplierSelect,
          empresa_fornecedor: {
            where: { id_empresa: ctx.idEmpresa },
            select: {
              id: true,
              prazo_pagamento: true,
              prazo_entrega: true,
              observacao: true,
              status: true,
            },
          },
        },
        orderBy: [{ razao_social: filters.ordem }, { id: "asc" }],
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      tx.fornecedores.count({ where }),
    ])
    return { rows, count }
  })
}
export function audit(
  ctx: Contexto,
  id: number,
  before: unknown | null,
  after: unknown,
  tx: Database,
) {
  return tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela: "empresa_fornecedor",
      id_registro: id,
      acao: before === null ? "INSERT" : "UPDATE",
      dados_anteriores:
        before === null
          ? null
          : serializarJsonTextMysql(before, (m) => new ValidationError(m)),
      dados_novos: serializarJsonTextMysql(
        after,
        (m) => new ValidationError(m),
      ),
    },
  })
}

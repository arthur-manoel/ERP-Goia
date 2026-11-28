import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { ValidationError } from "@/lib/api/errors"
import { serializarJsonTextMysql } from "@/lib/limites-texto"
import { vinculoCatalogo } from "../catalogos/repository"
import type { EmpresaFilters } from "./schema"

export type Database = Prisma.TransactionClient
export type Escopo = Prisma.empresasWhereInput
const dados = {
  id: true,
  razao_social: true,
  nome_fantasia: true,
  cnpj: true,
  inscricao_estadual: true,
  email: true,
  telefone: true,
  endereco: true,
  numero: true,
  complemento: true,
  bairro: true,
  cidade: true,
  estado: true,
  cep: true,
  logo_url: true,
  cor_tema: true,
  status: true,
  data_cadastro: true,
  created_at: true,
  updated_at: true,
  inativado_em: true,
  inativado_por: true,
} satisfies Prisma.empresasSelect
const resumo = {
  id: true,
  razao_social: true,
  nome_fantasia: true,
  cnpj: true,
  cidade: true,
  estado: true,
  status: true,
  data_cadastro: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.empresasSelect

export type Empresa = Prisma.empresasGetPayload<{ select: typeof dados }>

export function transacao<T>(
  fn: (tx: Database) => Promise<T>,
  leitura = false,
) {
  return prisma.$transaction(fn, {
    isolationLevel: leitura ? "RepeatableRead" : "ReadCommitted",
    timeout: 15_000,
  })
}

export function usuarioAtivo(tx: Database, id: number) {
  return tx.usuarios.findFirst({
    where: { id, status: "ATIVO" },
    select: { nivel_acesso: true },
  })
}

export function escopoVinculado(
  id: number,
  acao: "pode_ler" | "pode_editar",
): Escopo {
  const vinculo = vinculoCatalogo(id, "EMPRESAS", [acao])
  // Empresa inativa é consultável pelo vínculo histórico. Escritas comuns exigem empresa ativa.
  return {
    usuario_empresa: {
      some: {
        ...vinculo,
        empresas: acao === "pode_ler" ? undefined : vinculo.empresas,
      },
    },
  }
}

const escapar = (valor: string) => valor.replace(/[\\%_]/g, "\\$&")

export function filtros(input: EmpresaFilters, escopo: Escopo): Escopo {
  const { search, razao_social, nome_fantasia, cidade, estado, status, cnpj } =
    input
  const documento = search?.replace(/[./-]/g, "")
  return {
    AND: [
      escopo,
      {
        razao_social: razao_social
          ? { contains: escapar(razao_social) }
          : undefined,
        nome_fantasia: nome_fantasia
          ? { contains: escapar(nome_fantasia) }
          : undefined,
        cidade: cidade ? { contains: escapar(cidade) } : undefined,
        cnpj,
        estado,
        status,
        OR: search
          ? [
              { razao_social: { contains: escapar(search) } },
              { nome_fantasia: { contains: escapar(search) } },
              { cidade: { contains: escapar(search) } },
              ...(documento && /^\d+$/.test(documento)
                ? [{ cnpj: { contains: documento } }]
                : []),
            ]
          : undefined,
      },
    ],
  }
}

export function findAll(tx: Database, where: Escopo, input: EmpresaFilters) {
  const { page, limit, sortBy, sortOrder } = input
  return tx.empresas.findMany({
    where,
    select: resumo,
    skip: (page - 1) * limit,
    take: limit,
    orderBy: [
      { [sortBy]: sortOrder },
      ...(sortBy === "id" ? [] : [{ id: "asc" as const }]),
    ],
  })
}
export function count(tx: Database, where: Escopo) {
  return tx.empresas.count({ where })
}
export function findById(tx: Database, id: number, escopo: Escopo) {
  return tx.empresas.findFirst({
    where: { AND: [{ id }, escopo] },
    select: dados,
  })
}
export function bloquear(tx: Database, id: number) {
  return tx.$queryRaw`SELECT id FROM empresas WHERE id = ${id} FOR UPDATE`
}
export function findByCnpj(tx: Database, cnpj: string, ignorarId?: number) {
  return tx.empresas.findFirst({
    where: {
      cnpj,
      id: ignorarId === undefined ? undefined : { not: ignorarId },
    },
    select: { id: true },
  })
}
export function create(
  tx: Database,
  data: Prisma.empresasUncheckedCreateInput,
) {
  return tx.empresas.create({ data, select: dados })
}
export function update(
  tx: Database,
  id: number,
  data: Prisma.empresasUncheckedUpdateInput,
) {
  return tx.empresas.update({ where: { id }, data, select: dados })
}
export const patch = update
export function inactivate(
  tx: Database,
  id: number,
  idUsuario: number,
  data: Prisma.empresasUncheckedUpdateInput,
) {
  return update(tx, id, {
    ...data,
    status: "INATIVA",
    inativado_em: new Date(),
    inativado_por: idUsuario,
  })
}
export function activate(
  tx: Database,
  id: number,
  data: Prisma.empresasUncheckedUpdateInput,
) {
  return update(tx, id, {
    ...data,
    status: "ATIVA",
    inativado_em: null,
    inativado_por: null,
  })
}

export type Ator = { idUsuario: number; ip?: string; agente?: string }
export type Evento = "CREATE" | "UPDATE" | "PATCH" | "ACTIVATE" | "INACTIVATE"
export function auditar(
  tx: Database,
  ator: Ator,
  evento: Evento,
  antes: Empresa | null,
  depois: Empresa,
) {
  const snapshot = (empresa: Empresa, metadata = {}) =>
    serializarJsonTextMysql(
      {
        id: empresa.id,
        razao_social: empresa.razao_social,
        nome_fantasia: empresa.nome_fantasia,
        cnpj: empresa.cnpj,
        cidade: empresa.cidade,
        estado: empresa.estado,
        status: empresa.status,
        cor_tema: empresa.cor_tema,
        created_at: empresa.created_at,
        updated_at: empresa.updated_at,
        inativado_em: empresa.inativado_em,
        inativado_por: empresa.inativado_por,
        ...metadata,
      },
      (msg) => new ValidationError(msg),
    )
  const camposAlterados =
    antes &&
    Object.keys(depois).filter((campo) => {
      const chave = campo as keyof Empresa
      return String(antes[chave]) !== String(depois[chave])
    })
  return tx.auditoria.create({
    data: {
      id_empresa: depois.id,
      id_usuario: ator.idUsuario,
      tabela: "empresas",
      id_registro: depois.id,
      acao: antes ? "UPDATE" : "INSERT",
      ip: ator.ip,
      dados_anteriores: antes ? snapshot(antes) : null,
      dados_novos: snapshot(depois, {
        evento,
        camposAlterados,
        user_agent: ator.agente,
      }),
    },
  })
}

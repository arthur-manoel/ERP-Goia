import "server-only"
import { createHash } from "node:crypto"
import {
  HttpError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors"
import { validate } from "@/lib/api/http"
import { disputaPersistencia } from "@/lib/prisma-concorrencia"
import { Prisma } from "@/generated/prisma/client"
import { administrador } from "@/modules/usuarios/usuarios.repository"
import { resolveUserRole } from "@/modules/auth/auth.role"
import type { Action } from "../catalogos/repository"
import * as repo from "./repository"
import {
  cargoFiltersSchema,
  consultasCargoSchema,
  createCargoSchema,
  patchCargoSchema,
  updateCargoSchema,
  type Paginacao,
} from "./schema"

async function autorizar(tx: repo.Tx, ctx: repo.Contexto, acao: Action) {
  const vinculo = await repo.acesso(tx, ctx, acao)
  if (!vinculo)
    throw new HttpError(
      403,
      "Sem vínculo ativo ou permissão de Cargos nesta empresa.",
    )
  return administrador(vinculo)
}

function exigirAdmin(admin: boolean) {
  if (!admin)
    throw new HttpError(
      403,
      "A configuração de aprovação exige administração da empresa.",
    )
}

async function buscar(tx: repo.Tx, ctx: repo.Contexto, id: number) {
  const cargo = await repo.findById(tx, ctx.idEmpresa, id)
  if (!cargo) throw new NotFoundError("Cargo não encontrado nesta empresa.")
  return cargo
}

function versao(cargo: repo.Cargo, revisao?: number) {
  return (
    '"' +
    createHash("sha256")
      .update(JSON.stringify([cargo, revisao]))
      .digest("hex") +
    '"'
  )
}

function paginar<T>(data: T[], total: number, { page, limit }: Paginacao) {
  const totalPages = Math.ceil(total / limit)
  return {
    data,
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  }
}

export function listar(ctx: repo.Contexto, input: unknown) {
  return repo.transacao(async (tx) => {
    await autorizar(tx, ctx, "pode_ler")
    const filtro = validate(cargoFiltersSchema, input)
    if (filtro.id_empresa !== undefined && filtro.id_empresa !== ctx.idEmpresa)
      throw new HttpError(403, "Empresa fora do contexto ativo.")
    const where = repo.filtros(ctx.idEmpresa, filtro)
    const [rows, total] = await Promise.all([
      repo.findAll(tx, where, filtro, ctx.idEmpresa),
      repo.count(tx, where),
    ])
    return paginar(
      rows.map(({ _count, ...cargo }) => ({
        ...cargo,
        quantidade_usuarios: _count.usuario_empresa,
      })),
      total,
      filtro,
    )
  })
}

export function consultar(
  ctx: repo.Contexto,
  id: number,
  tipo: "cargo" | "usuarios" | "historico",
  query: unknown,
) {
  return repo.transacao(async (tx) => {
    const admin = await autorizar(tx, ctx, "pode_ler")
    const cargo = await buscar(tx, ctx, id)
    if (tipo !== "cargo") {
      if (!admin)
        throw new HttpError(
          403,
          "Consulta restrita à administração da empresa.",
        )
      const p = validate(consultasCargoSchema, query)
      if (tipo === "historico") {
        const [rows, total] = await repo.historico(tx, cargo, p)
        return { data: paginar(rows, total, p) }
      }
      const [rows, total] = await Promise.all([
        repo.findUsuariosVinculados(tx, cargo, p),
        repo.countUsuarios(tx, cargo),
      ])
      return { data: paginar(rows, total, p) }
    }
    const [revisao, quantidade_usuarios] = await Promise.all([
      repo.ultimaRevisao(tx, cargo),
      repo.countUsuarios(tx, cargo),
    ])
    return {
      data: { ...cargo, quantidade_usuarios },
      etag: versao(cargo, revisao?.id),
    }
  })
}

async function nomeDisponivel(
  tx: repo.Tx,
  ctx: repo.Contexto,
  nome: string,
  id?: number,
) {
  if (await repo.findByNome(tx, ctx.idEmpresa, nome, id))
    throw new ConflictError("Já existe um cargo com este nome na empresa.")
}

async function gravar<T>(operation: (tx: repo.Tx) => Promise<T>) {
  try {
    return await repo.transacao(operation, true)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new ConflictError("Já existe um cargo com este nome na empresa.")
    if (disputaPersistencia(error))
      throw new ConflictError(
        "Conflito de gravação. Consulte o cargo e tente novamente.",
      )
    throw error
  }
}

export function criar(ctx: repo.Contexto, input: unknown) {
  return gravar(async (tx) => {
    const admin = await autorizar(tx, ctx, "pode_criar")
    const data = validate(createCargoSchema, input)
    if (data.id_empresa !== ctx.idEmpresa)
      throw new HttpError(403, "Empresa fora do contexto ativo.")
    if (data.aprova_cancelamento) exigirAdmin(admin)
    await nomeDisponivel(tx, ctx, data.nome)
    const cargo = await repo.create(tx, data)
    const revisao = await repo.auditar(tx, ctx, "CREATE", null, cargo)
    return { data: cargo, etag: versao(cargo, revisao.id) }
  })
}

export function alterar(
  ctx: repo.Contexto,
  id: number,
  operacao: "PUT" | "PATCH" | "ativar" | "inativar",
  etag: string | null,
  input: unknown,
) {
  return gravar(async (tx) => {
    const admin = await autorizar(
      tx,
      ctx,
      operacao === "inativar" ? "pode_excluir" : "pode_editar",
    )
    const status =
      operacao === "ativar"
        ? "ATIVO"
        : operacao === "inativar"
          ? "INATIVO"
          : undefined
    // A trava também coordena o estado do cargo com as atribuições transacionais de Usuários.
    await repo.bloquear(tx, ctx.idEmpresa, id)
    const anterior = await buscar(tx, ctx, id)
    const revisao = await repo.ultimaRevisao(tx, anterior)
    const atual = versao(anterior, revisao?.id)
    if (status === anterior.status) return { data: anterior, etag: atual }
    if (!etag || !/^"[a-f0-9]{64}"$/.test(etag))
      throw new ValidationError(
        "Informe o ETag do cargo no cabeçalho If-Match.",
      )
    if (atual !== etag)
      throw new ConflictError(
        "O cargo mudou. Consulte a versão atual e tente novamente.",
      )

    let depois: repo.Cargo
    if (status === "INATIVO") {
      const ativos = await repo.countUsuarios(tx, anterior, true)
      if (ativos)
        throw new ConflictError(
          `O cargo possui ${ativos} vínculo(s) ativo(s). Transfira-os para outro cargo antes de inativar.`,
        )
      depois = await repo.inactivate(tx, anterior)
    } else if (status === "ATIVO") {
      await nomeDisponivel(tx, ctx, anterior.nome, id)
      depois = await repo.activate(tx, anterior)
    } else {
      const dados = validate(
        operacao === "PUT" ? updateCargoSchema : patchCargoSchema,
        input,
      )
      if (
        dados.aprova_cancelamento !== undefined &&
        dados.aprova_cancelamento !== anterior.aprova_cancelamento
      )
        exigirAdmin(admin)
      if (dados.nome !== undefined && dados.nome !== anterior.nome) {
        await nomeDisponivel(tx, ctx, dados.nome, id)
        const usuarios = await repo.perfisAfetados(tx, anterior)
        for (const usuario of usuarios) {
          const perfil = resolveUserRole({
            ...usuario,
            usuario_empresa: usuario.usuario_empresa.map((vinculo) =>
              vinculo.id_cargo === id
                ? {
                    ...vinculo,
                    cargos: { ...vinculo.cargos, nome: dados.nome! },
                  }
                : vinculo,
            ),
          })
          if (!perfil)
            throw new ConflictError(
              "O novo nome deixaria um usuário ativo sem perfil de login válido.",
            )
          if (perfil !== resolveUserRole(usuario) && !admin)
            throw new HttpError(
              403,
              "A mudança de perfil de login exige administração da empresa.",
            )
        }
      }
      depois = await (operacao === "PUT" ? repo.update : repo.patch)(
        tx,
        anterior,
        dados,
      )
    }
    const evento =
      status === "ATIVO"
        ? "ACTIVATE"
        : status === "INATIVO"
          ? "INACTIVATE"
          : operacao === "PUT"
            ? "UPDATE"
            : "PATCH"
    const registro = await repo.auditar(tx, ctx, evento, anterior, depois)
    return { data: depois, etag: versao(depois, registro.id) }
  })
}

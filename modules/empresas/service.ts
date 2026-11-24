import "server-only"
import {
  HttpError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/lib/api/errors"
import { validate } from "@/lib/api/http"
import { disputaPersistencia } from "@/lib/prisma-concorrencia"
import { Prisma } from "@/generated/prisma/client"
import * as repo from "./repository"
import {
  cnpjValido,
  createEmpresaSchema,
  updateEmpresaSchema,
  patchEmpresaSchema,
  empresaFiltersSchema,
} from "./schema"

const exigirAdmin = (admin: boolean) => {
  if (!admin)
    throw new HttpError(403, "Operação restrita à administração global.")
}
async function administrador(tx: repo.Database, ator: repo.Ator) {
  const usuario = await repo.usuarioAtivo(tx, ator.idUsuario)
  if (!usuario) throw new HttpError(401, "Não autenticado.")
  return usuario.nivel_acesso === "ADMIN"
}

export async function listarEmpresas(
  ator: repo.Ator,
  input: unknown,
  selecionada?: number,
) {
  const filtros = validate(empresaFiltersSchema, input)
  return repo.transacao(async (tx) => {
    const admin = await administrador(tx, ator)
    const escopo = admin ? {} : repo.escopoVinculado(ator.idUsuario, "pode_ler")
    if (
      selecionada !== undefined &&
      !(await repo.findById(tx, selecionada, escopo))
    )
      throw new NotFoundError("Empresa não encontrada.")
    const where = repo.filtros(filtros, { ...escopo, id: selecionada })
    const [data, total] = await Promise.all([
      repo.findAll(tx, where, filtros),
      repo.count(tx, where),
    ])
    const { page, limit } = filtros
    const totalPages = Math.ceil(total / limit)
    return {
      data,
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    }
  }, true)
}

export async function consultarEmpresa(ator: repo.Ator, id: number) {
  return repo.transacao(async (tx) => {
    const admin = await administrador(tx, ator)
    const empresa = await repo.findById(
      tx,
      id,
      admin ? {} : repo.escopoVinculado(ator.idUsuario, "pode_ler"),
    )
    if (!empresa) throw new NotFoundError("Empresa não encontrada.")
    return empresa
  }, true)
}

async function verificarCnpj(tx: repo.Database, cnpj: string, id?: number) {
  if (!cnpjValido(cnpj)) throw new ValidationError("CNPJ inválido.")
  if (await repo.findByCnpj(tx, cnpj, id))
    throw new ConflictError("Já existe uma empresa com este CNPJ.")
}

async function gravar<T>(fn: (tx: repo.Database) => Promise<T>) {
  try {
    return await repo.transacao(fn)
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new ConflictError("Já existe uma empresa com este CNPJ.")
    if (disputaPersistencia(error))
      throw new ConflictError(
        "Conflito de gravação. Consulte a empresa e tente novamente.",
      )
    throw error
  }
}

export async function criarEmpresa(ator: repo.Ator, input: unknown) {
  const data = validate(createEmpresaSchema, input)
  return gravar(async (tx) => {
    exigirAdmin(await administrador(tx, ator))
    await verificarCnpj(tx, data.cnpj)
    const empresa = await repo.create(tx, data)
    await repo.auditar(tx, ator, "CREATE", null, empresa)
    return empresa
  })
}

export async function alterarEmpresa(
  ator: repo.Ator,
  id: number,
  metodo: "PUT" | "PATCH" | "DELETE",
  input?: unknown,
) {
  const { status, cnpj, ...campos } =
    metodo === "DELETE"
      ? { status: "INATIVA" as const, cnpj: undefined }
      : validate(
          metodo === "PUT" ? updateEmpresaSchema : patchEmpresaSchema,
          input,
        )
  return gravar(async (tx) => {
    const admin = await administrador(tx, ator)
    const escopo = admin
      ? {}
      : repo.escopoVinculado(ator.idUsuario, "pode_editar")
    if (!(await repo.findById(tx, id, escopo)))
      throw new NotFoundError("Empresa não encontrada.")
    await repo.bloquear(tx, id)
    const antes = await repo.findById(tx, id, escopo)
    if (!antes) throw new NotFoundError("Empresa não encontrada.")
    if (status !== undefined) exigirAdmin(admin)
    if (cnpj !== undefined && cnpj !== antes.cnpj) {
      exigirAdmin(admin)
      await verificarCnpj(tx, cnpj, id)
    }
    if (metodo === "DELETE" && antes.status === "INATIVA") return antes
    const mudanca = status !== undefined && status !== antes.status
    const dados = { ...campos, cnpj }
    const salvar = metodo === "PATCH" ? repo.patch : repo.update
    const depois = mudanca
      ? status === "ATIVA"
        ? await repo.activate(tx, id, dados)
        : await repo.inactivate(tx, id, ator.idUsuario, dados)
      : await salvar(tx, id, dados)
    if (
      metodo !== "DELETE" &&
      (Object.keys(campos).length || cnpj !== undefined || !mudanca)
    )
      await repo.auditar(
        tx,
        ator,
        metodo === "PUT" ? "UPDATE" : "PATCH",
        antes,
        depois,
      )
    if (mudanca)
      await repo.auditar(
        tx,
        ator,
        status === "ATIVA" ? "ACTIVATE" : "INACTIVATE",
        antes,
        depois,
      )
    return depois
  })
}

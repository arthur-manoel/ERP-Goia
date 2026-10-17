import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { conflitoPersistencia } from "../producao/producao.errors"
import type { CriarUsuarioInput } from "./usuarios.schema"

export class UsuarioError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}
export type Contexto = { idUsuario: number; idEmpresa: number }
type Transaction = Prisma.TransactionClient
const includeVinculo = {
  usuarios: { select: { nivel_acesso: true } },
} satisfies Prisma.usuario_empresaInclude
export function vinculosAtivos(idUsuario: number) {
  return prisma.usuario_empresa.findMany({
    where: {
      id_usuario: idUsuario,
      status: "ATIVO",
      empresas: { status: "ATIVA" },
      usuarios: { status: "ATIVO" },
    },
    include: includeVinculo,
  })
}
export function administrador(vinculo: {
  nivel_acesso: string
  usuarios: { nivel_acesso: string }
}) {
  return (
    vinculo.nivel_acesso === "EMPRESA" ||
    vinculo.usuarios.nivel_acesso === "ADMIN"
  )
}
export async function gravacao<T>(
  ctx: Contexto,
  operation: (tx: Transaction) => Promise<T>,
) {
  try {
    return await prisma.$transaction(
      async (tx) => {
        // Revalida autorização dentro da transação, protegendo também revogações concorrentes.
        const vinculo = await tx.usuario_empresa.findFirst({
          where: {
            id_usuario: ctx.idUsuario,
            id_empresa: ctx.idEmpresa,
            status: "ATIVO",
            empresas: { status: "ATIVA" },
            usuarios: { status: "ATIVO" },
          },
          include: includeVinculo,
        })
        if (!vinculo || !administrador(vinculo))
          throw new UsuarioError(
            403,
            "Somente administradores da empresa podem cadastrar funcionários.",
          )
        return operation(tx)
      },
      { isolationLevel: "Serializable" },
    )
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      throw new UsuarioError(409, "Este e-mail já está cadastrado.")
    if (conflitoPersistencia(error))
      throw new UsuarioError(
        409,
        "Conflito de cadastro. Atualize os dados e tente novamente.",
      )
    throw error
  }
}
export async function buscarCargo(tx: Transaction, ctx: Contexto, id: number) {
  const cargo = await tx.cargos.findFirst({
    where: { id, id_empresa: ctx.idEmpresa, status: "ATIVO" },
    select: { id: true, nome: true, status: true },
  })
  if (!cargo)
    throw new UsuarioError(404, "Cargo ativo não encontrado nesta empresa.")
  return cargo
}
export async function buscarSetor(
  tx: Transaction,
  ctx: Contexto,
  id?: number | null,
) {
  if (id == null) return null
  const setor = await tx.setores.findFirst({
    where: { id, id_empresa: ctx.idEmpresa, status: "ATIVO" },
    select: { id: true, nome: true, tipo: true, status: true },
  })
  if (!setor)
    throw new UsuarioError(404, "Setor ativo não encontrado nesta empresa.")
  return setor
}
export async function garantirEmailDisponivel(tx: Transaction, email: string) {
  if (await tx.usuarios.findUnique({ where: { email }, select: { id: true } }))
    throw new UsuarioError(409, "Este e-mail já está cadastrado.")
}
const usuarioPublico = {
  id: true,
  nome: true,
  email: true,
  nivel_acesso: true,
  status: true,
  data_cadastro: true,
  usuario_empresa: {
    select: {
      id: true,
      id_empresa: true,
      id_cargo: true,
      id_setor: true,
      nivel_acesso: true,
      status: true,
    },
  },
} satisfies Prisma.usuariosSelect
export function criarFuncionario(
  tx: Transaction,
  ctx: Contexto,
  input: CriarUsuarioInput,
  senhaHash: string,
) {
  return tx.usuarios.create({
    data: {
      nome: input.nome,
      email: input.email,
      senha: senhaHash,
      nivel_acesso: "USUARIO",
      status: "ATIVO",
      usuario_empresa: {
        create: {
          id_empresa: ctx.idEmpresa,
          id_cargo: input.idCargo,
          id_setor: input.idSetor ?? null,
          nivel_acesso: "USUARIO",
          status: "ATIVO",
        },
      },
    },
    select: usuarioPublico,
  })
}
export type UsuarioPublico = Awaited<ReturnType<typeof criarFuncionario>>
export function auditar(
  tx: Transaction,
  ctx: Contexto,
  usuario: UsuarioPublico,
) {
  return tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela: "usuarios",
      id_registro: usuario.id,
      acao: "INSERT",
      dados_novos: JSON.stringify(usuario),
    },
  })
}

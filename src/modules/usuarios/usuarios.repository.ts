import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { conflitoPersistencia } from "../producao/producao.errors"
import type {
  CriarUsuarioInput,
  EditarUsuarioInput,
  ListarUsuariosInput,
  PermissaoInput,
  VincularUsuarioInput,
} from "./usuarios.schema"
import { resolveUserRole } from "../auth/auth.role"

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
    select: {
      id: true,
      status: true,
      permissoes_setor: { select: { recurso: true } },
    },
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

const vinculoInclude = {
  usuarios: { select: { nivel_acesso: true, status: true } },
  empresas: { select: { status: true } },
  cargos: { select: { nome: true, status: true } },
  setores: { select: { nome: true, tipo: true, status: true } },
  permissoes_usuario: true,
} satisfies Prisma.usuario_empresaInclude

export function listarUsuarios(
  tx: Transaction,
  ctx: Contexto,
  filtro: ListarUsuariosInput,
) {
  const statusLink = filtro.status === "ATIVO" ? "ATIVO" : undefined
  const where: Prisma.usuariosWhereInput = {
    AND: [
      {
        usuario_empresa: {
          some: {
            id_empresa: ctx.idEmpresa,
            status: statusLink,
            id_cargo: filtro.idCargo,
            id_setor:
              filtro.idSetor === undefined
                ? undefined
                : filtro.idSetor === null
                  ? null
                  : filtro.idSetor,
          },
        },
      },
      filtro.busca
        ? {
            OR: [
              { nome: { contains: filtro.busca.replace(/[\\%_]/g, "\\$&") } },
              { email: { contains: filtro.busca.replace(/[\\%_]/g, "\\$&") } },
            ],
          }
        : {},
      filtro.status === "ATIVO" ? { status: "ATIVO" } : {},
      filtro.status === "INATIVO"
        ? {
            OR: [
              { status: "INATIVO" },
              {
                usuario_empresa: {
                  some: { id_empresa: ctx.idEmpresa, status: "INATIVO" },
                },
              },
            ],
          }
        : {},
    ],
  }
  return Promise.all([
    tx.usuarios.count({ where }),
    tx.usuarios.findMany({
      where,
      orderBy: [{ nome: "asc" }, { id: "asc" }],
      skip: (filtro.pagina - 1) * filtro.limite,
      take: filtro.limite,
      select: {
        id: true,
        nome: true,
        email: true,
        status: true,
        data_cadastro: true,
        _count: {
          select: {
            usuario_empresa: {
              where: { status: "ATIVO", empresas: { status: "ATIVA" } },
            },
          },
        },
        usuario_empresa: {
          where: { id_empresa: ctx.idEmpresa },
          include: vinculoInclude,
        },
      },
    }),
  ]).then(([total, usuarios]) => ({
    usuarios,
    paginacao: {
      pagina: filtro.pagina,
      limite: filtro.limite,
      total,
      totalPaginas: Math.ceil(total / filtro.limite),
    },
  }))
}

export async function opcoesUsuario(tx: Transaction, ctx: Contexto) {
  const [cargos, setores] = await Promise.all([
    tx.cargos.findMany({
      where: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
      select: { id: true, nome: true, status: true },
      orderBy: [{ nome: "asc" }, { id: "asc" }],
    }),
    tx.setores.findMany({
      where: { id_empresa: ctx.idEmpresa, status: "ATIVO" },
      select: { id: true, nome: true, tipo: true, status: true },
      orderBy: [{ nome: "asc" }, { id: "asc" }],
    }),
  ])
  return { cargos, setores }
}

export async function consultarUsuario(
  tx: Transaction,
  ctx: Contexto,
  id: number,
) {
  const usuario = await tx.usuarios.findFirst({
    where: { id, usuario_empresa: { some: { id_empresa: ctx.idEmpresa } } },
    select: {
      id: true,
      nome: true,
      email: true,
      status: true,
      data_cadastro: true,
      _count: {
        select: {
          usuario_empresa: {
            where: { status: "ATIVO", empresas: { status: "ATIVA" } },
          },
        },
      },
      usuario_empresa: {
        where: { id_empresa: ctx.idEmpresa },
        include: vinculoInclude,
      },
    },
  })
  if (!usuario) throw new UsuarioError(404, "Usuário não encontrado.")
  return usuario
}

export async function vinculoDaEmpresa(
  tx: Transaction,
  ctx: Contexto,
  idUsuario: number,
) {
  const usuario = await consultarUsuario(tx, ctx, idUsuario)
  const vinculo = usuario.usuario_empresa[0]
  if (!vinculo) throw new UsuarioError(404, "Vínculo não encontrado.")
  return { usuario, vinculo }
}

export async function garantirCargoSetor(
  tx: Transaction,
  ctx: Contexto,
  idCargo: number,
  idSetor?: number | null,
) {
  const cargo = await buscarCargo(tx, ctx, idCargo)
  const setor = await buscarSetor(tx, ctx, idSetor)
  return { cargo, setor }
}

export async function garantirEmailDisponivelExceto(
  tx: Transaction,
  email: string,
  idUsuario?: number,
) {
  const existente = await tx.usuarios.findUnique({
    where: { email },
    select: { id: true },
  })
  if (existente && existente.id !== idUsuario)
    throw new UsuarioError(409, "Este e-mail já está cadastrado.")
}

export async function vincularUsuarioExistente(
  tx: Transaction,
  ctx: Contexto,
  input: VincularUsuarioInput,
) {
  const usuario = await tx.usuarios.findUnique({
    where: { email: input.email },
    select: { id: true, nome: true, email: true, status: true },
  })
  if (!usuario)
    throw new UsuarioError(404, "Não existe usuário com esse e-mail.")
  if (usuario.status !== "ATIVO")
    throw new UsuarioError(
      409,
      "O usuário está inativo e não pode receber vínculos.",
    )
  const existente = await tx.usuario_empresa.findUnique({
    where: {
      id_usuario_id_empresa: {
        id_usuario: usuario.id,
        id_empresa: ctx.idEmpresa,
      },
    },
  })
  if (existente)
    throw new UsuarioError(409, "O usuário já possui vínculo com esta empresa.")
  const { cargo, setor } = await garantirCargoSetor(
    tx,
    ctx,
    input.idCargo,
    input.idSetor,
  )
  const vinculo = await tx.usuario_empresa.create({
    data: {
      id_usuario: usuario.id,
      id_empresa: ctx.idEmpresa,
      id_cargo: cargo.id,
      id_setor: setor?.id ?? null,
      nivel_acesso: "USUARIO",
      status: "ATIVO",
    },
    include: vinculoInclude,
  })
  await validarPerfil(tx, usuario.id)
  await revogarSessoes(tx, usuario.id)
  await auditarAlteracao(tx, ctx, "INSERT", usuario.id, null, {
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
    vinculo,
  })
  return { usuario: { ...usuario, usuario_empresa: [vinculo] } }
}

export async function editarUsuario(
  tx: Transaction,
  ctx: Contexto,
  id: number,
  input: EditarUsuarioInput,
) {
  const { usuario, vinculo } = await vinculoDaEmpresa(tx, ctx, id)
  const antes = { usuario, vinculo }
  if (input.nome !== undefined || input.email !== undefined) {
    const outrosVinculos = await tx.usuario_empresa.count({
      where: {
        id_usuario: id,
        status: "ATIVO",
        id_empresa: { not: ctx.idEmpresa },
      },
    })
    if (outrosVinculos)
      throw new UsuarioError(
        403,
        "Nome e e-mail são compartilhados entre empresas; altere-os somente quando o usuário não tiver outros vínculos ativos.",
      )
    if (input.email) await garantirEmailDisponivelExceto(tx, input.email, id)
    await tx.usuarios.update({
      where: { id },
      data: { nome: input.nome, email: input.email },
    })
  }
  if (input.idCargo !== undefined || input.idSetor !== undefined) {
    const { cargo, setor } = await garantirCargoSetor(
      tx,
      ctx,
      input.idCargo ?? vinculo.id_cargo,
      input.idSetor === undefined ? vinculo.id_setor : input.idSetor,
    )
    await tx.usuario_empresa.update({
      where: { id: vinculo.id },
      data: { id_cargo: cargo.id, id_setor: setor?.id ?? null },
    })
    await validarPerfil(tx, id)
    await revogarSessoes(tx, id)
  }
  if (input.statusVinculo !== undefined) {
    if (input.statusVinculo === "ATIVO" && usuario.status !== "ATIVO")
      throw new UsuarioError(
        409,
        "Reative o cadastro global do usuário antes de reativar o vínculo.",
      )
    await tx.usuario_empresa.update({
      where: { id: vinculo.id },
      data: { status: input.statusVinculo },
    })
    await revogarSessoes(tx, id)
  }
  const depois = await consultarUsuario(tx, ctx, id)
  await auditarAlteracao(tx, ctx, "UPDATE", id, antes, depois)
  return { usuario: depois }
}

export async function editarPermissoes(
  tx: Transaction,
  ctx: Contexto,
  id: number,
  permissoes: PermissaoInput[],
) {
  const { usuario, vinculo } = await vinculoDaEmpresa(tx, ctx, id)
  const antes = vinculo.permissoes_usuario
  const recursos = permissoes.map((item) => item.recurso)
  await tx.permissoes_usuario.deleteMany({
    where: {
      id_usuario_empresa: vinculo.id,
      recurso: { notIn: recursos },
    },
  })
  for (const item of permissoes) {
    await tx.permissoes_usuario.upsert({
      where: {
        id_usuario_empresa_recurso: {
          id_usuario_empresa: vinculo.id,
          recurso: item.recurso,
        },
      },
      create: { id_usuario_empresa: vinculo.id, ...item },
      update: {
        pode_ler: item.pode_ler,
        pode_criar: item.pode_criar,
        pode_editar: item.pode_editar,
        pode_excluir: item.pode_excluir,
      },
    })
  }
  const depois = await tx.permissoes_usuario.findMany({
    where: { id_usuario_empresa: vinculo.id },
    orderBy: { recurso: "asc" },
  })
  await auditarAlteracao(
    tx,
    ctx,
    "UPDATE",
    id,
    antes,
    depois,
    "permissoes_usuario",
  )
  return { idUsuario: usuario.id, permissoes: depois }
}

export async function inativarVinculo(
  tx: Transaction,
  ctx: Contexto,
  id: number,
) {
  return editarUsuario(tx, ctx, id, { statusVinculo: "INATIVO" })
}

export async function revogarSessoes(tx: Transaction, idUsuario: number) {
  await tx.refresh_tokens.updateMany({
    where: { id_usuario: idUsuario, revogado: false },
    data: { revogado: true, data_revogacao: new Date() },
  })
}

export async function validarPerfil(tx: Transaction, idUsuario: number) {
  const usuario = await tx.usuarios.findUnique({
    where: { id: idUsuario },
    include: {
      usuario_empresa: {
        include: {
          empresas: { select: { status: true } },
          cargos: { select: { nome: true, status: true } },
          setores: { select: { nome: true, tipo: true, status: true } },
        },
      },
    },
  })
  if (!usuario || usuario.status !== "ATIVO") return null
  const perfil = resolveUserRole(usuario)
  if (!perfil)
    throw new UsuarioError(
      422,
      "Os vínculos ativos precisam resolver para um único perfil de login.",
    )
  return perfil
}

export async function auditarAlteracao(
  tx: Transaction,
  ctx: Contexto,
  acao: "INSERT" | "UPDATE",
  id: number,
  antes: unknown,
  depois: unknown,
  tabela = "usuarios",
) {
  await tx.auditoria.create({
    data: {
      id_empresa: ctx.idEmpresa,
      id_usuario: ctx.idUsuario,
      tabela,
      id_registro: id,
      acao,
      dados_anteriores: antes == null ? null : JSON.stringify(antes),
      dados_novos: JSON.stringify(depois),
    },
  })
}

import "server-only"
import { hashPassword, verifyPassword } from "@/lib/password"
import { prisma } from "@/lib/prisma"
import { resolveUserRole } from "../auth/auth.role"
import * as repository from "./usuarios.repository"
import type {
  CriarUsuarioInput,
  EditarUsuarioInput,
  ListarUsuariosInput,
  PermissaoInput,
  VincularUsuarioInput,
} from "./usuarios.schema"

export async function cadastrarFuncionario(
  ctx: repository.Contexto,
  input: CriarUsuarioInput,
) {
  // Não manter locks durante o cálculo do hash Argon2id.
  const senhaHash = await hashPassword(input.password)
  return repository.gravacao(ctx, async (tx) => {
    const cargo = await repository.buscarCargo(tx, ctx, input.idCargo)
    const setor = await repository.buscarSetor(tx, ctx, input.idSetor)
    const perfil = resolveUserRole({
      nivel_acesso: "USUARIO",
      usuario_empresa: [
        {
          status: "ATIVO",
          nivel_acesso: "USUARIO",
          empresas: { status: "ATIVA" },
          cargos: cargo,
          setores: setor,
        },
      ],
    })
    if (!perfil)
      throw new repository.UsuarioError(
        422,
        "O cargo e o setor precisam definir um único perfil válido para login: Administração, Produção, Vendas ou Financeiro.",
      )
    await repository.garantirEmailDisponivel(tx, input.email)
    const usuario = await repository.criarFuncionario(tx, ctx, input, senhaHash)
    const idVinculo = usuario.usuario_empresa[0]?.id
    if (idVinculo && input.permissoes?.length)
      await tx.permissoes_usuario.createMany({
        data: input.permissoes.map((permissao) => ({
          ...permissao,
          id_usuario_empresa: idVinculo,
        })),
      })
    await repository.auditar(tx, ctx, usuario)
    return { usuario, perfil }
  })
}

export async function listarFuncionarios(
  ctx: repository.Contexto,
  filtro: ListarUsuariosInput,
) {
  return prisma.$transaction(
    async (tx) => {
      const [resultado, opcoes] = await Promise.all([
        repository.listarUsuarios(tx, ctx, filtro),
        repository.opcoesUsuario(tx, ctx),
      ])
      return { ...resultado, ...opcoes }
    },
    { isolationLevel: "RepeatableRead" },
  )
}

export function editarFuncionario(
  ctx: repository.Contexto,
  id: number,
  input: EditarUsuarioInput,
) {
  return repository.gravacao(ctx, (tx) =>
    repository.editarUsuario(tx, ctx, id, input),
  )
}

export function vincularFuncionario(
  ctx: repository.Contexto,
  input: VincularUsuarioInput,
) {
  return repository.gravacao(ctx, (tx) =>
    repository.vincularUsuarioExistente(tx, ctx, input),
  )
}

export function inativarFuncionario(ctx: repository.Contexto, id: number) {
  return repository.gravacao(ctx, (tx) =>
    repository.inativarVinculo(tx, ctx, id),
  )
}

export function atualizarPermissoesFuncionario(
  ctx: repository.Contexto,
  id: number,
  permissoes: PermissaoInput[],
) {
  return repository.gravacao(ctx, (tx) =>
    repository.editarPermissoes(tx, ctx, id, permissoes),
  )
}

export async function redefinirSenhaFuncionario(
  ctx: repository.Contexto,
  id: number,
  password: string,
) {
  const senhaHash = await hashPassword(password)
  return repository.gravacao(ctx, async (tx) => {
    const { usuario } = await repository.vinculoDaEmpresa(tx, ctx, id)
    await tx.usuarios.update({ where: { id }, data: { senha: senhaHash } })
    await repository.revogarSessoes(tx, id)
    await repository.auditarAlteracao(
      tx,
      ctx,
      "UPDATE",
      id,
      { senha: "[redacted]" },
      { senha: "[redefined]", email: usuario.email },
    )
    return { ok: true }
  })
}

export async function trocarMinhaSenha(
  idUsuario: number,
  currentPassword: string,
  password: string,
) {
  const usuario = await prisma.usuarios.findFirst({
    where: { id: idUsuario, status: "ATIVO" },
    select: { senha: true, email: true },
  })
  if (!usuario) throw new repository.UsuarioError(401, "Não autenticado.")
  if (!(await verifyPassword(currentPassword, usuario.senha)))
    throw new repository.UsuarioError(403, "A senha atual está incorreta.")
  const senhaHash = await hashPassword(password)
  return prisma.$transaction(
    async (tx) => {
      const atualizado = await tx.usuarios.updateMany({
        where: { id: idUsuario, status: "ATIVO", senha: usuario.senha },
        data: { senha: senhaHash },
      })
      if (atualizado.count !== 1)
        throw new repository.UsuarioError(
          409,
          "A senha foi alterada por outra operação. Entre novamente.",
        )
      await repository.revogarSessoes(tx, idUsuario)
      await tx.auditoria.create({
        data: {
          id_usuario: idUsuario,
          tabela: "usuarios",
          id_registro: idUsuario,
          acao: "UPDATE",
          dados_anteriores: JSON.stringify({
            email: usuario.email,
            senha: "[redacted]",
          }),
          dados_novos: JSON.stringify({
            email: usuario.email,
            senha: "[changed]",
          }),
        },
      })
      return { ok: true }
    },
    { isolationLevel: "Serializable" },
  )
}

export async function possuiVinculoAtivo(idUsuario: number) {
  const vinculo = await prisma.usuario_empresa.findFirst({
    where: {
      id_usuario: idUsuario,
      status: "ATIVO",
      usuarios: { status: "ATIVO" },
      empresas: { status: "ATIVA" },
    },
    select: { id: true },
  })
  return Boolean(vinculo)
}

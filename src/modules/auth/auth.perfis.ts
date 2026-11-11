import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import type { Role } from "@/lib/auth-db"
import { HttpError } from "@/lib/api/errors"
import { administrador, type Contexto } from "../usuarios/usuarios.repository"
import { toSessionUser, userInclude } from "./auth.prisma-adapter"
import { lockUsers, revokeUserSessions } from "./auth.repository"

export async function perfisAntesDeAlterarSetor(
  tx: Prisma.TransactionClient,
  idSetor: number,
  idAutor: number,
) {
  const vinculos = await tx.usuario_empresa.findMany({
    where: {
      id_setor: idSetor,
      status: "ATIVO",
      empresas: { status: "ATIVA" },
    },
    select: { id_usuario: true },
    distinct: ["id_usuario"],
  })
  const ids = vinculos.map((vinculo) => vinculo.id_usuario)
  if (ids.length) await lockUsers(tx, [...new Set([...ids, idAutor])])
  return perfisAtuais(tx, ids)
}

async function perfisAtuais(tx: Prisma.TransactionClient, ids: number[]) {
  if (!ids.length) return new Map<number, Role | null>()
  const usuarios = await tx.usuarios.findMany({
    where: { id: { in: ids } },
    include: userInclude,
  })
  return new Map(
    usuarios.map((usuario) => [
      usuario.id,
      toSessionUser(usuario)?.role ?? null,
    ]),
  )
}

export async function revogarPerfisAlterados(
  tx: Prisma.TransactionClient,
  ctx: Contexto,
  antes: Map<number, Role | null>,
) {
  if (!antes.size) return
  const depois = await perfisAtuais(tx, [...antes.keys()])
  const alterados = [...antes.keys()].filter(
    (id) => antes.get(id) !== depois.get(id),
  )
  if (!alterados.length) return
  const vinculo = await tx.usuario_empresa.findFirst({
    where: {
      id_usuario: ctx.idUsuario,
      id_empresa: ctx.idEmpresa,
      status: "ATIVO",
      empresas: { status: "ATIVA" },
      usuarios: { status: "ATIVO" },
    },
    select: {
      nivel_acesso: true,
      usuarios: { select: { nivel_acesso: true } },
    },
  })
  if (!vinculo || !administrador(vinculo))
    throw new HttpError(
      403,
      "Somente administradores da empresa podem alterar perfis.",
    )
  await revokeUserSessions(tx, alterados)
}

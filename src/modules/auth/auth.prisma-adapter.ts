import "server-only"
import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import type { AuthDb, Role } from "@/lib/auth-db"

import { resolveUserRole } from "./auth.role"

export const userInclude = {
  usuario_empresa: {
    include: {
      empresas: { select: { status: true } },
      cargos: { select: { nome: true, status: true } },
      setores: {
        select: {
          status: true,
          permissoes_setor: { select: { recurso: true } },
        },
      },
    },
  },
} satisfies Prisma.usuariosInclude

type AuthUser = Prisma.usuariosGetPayload<{ include: typeof userInclude }>

export type ResolveUserRole = (
  user: AuthUser,
) => Role | null | Promise<Role | null>

export function toSessionUser(user: AuthUser | null) {
  if (!user || user.status !== "ATIVO") return null
  const role = resolveUserRole(user)
  return role ? { id: user.id, name: user.nome, role } : null
}

export function createPrismaAuthDb(
  prisma: Pick<PrismaClient, "usuarios">,
  resolveRole?: ResolveUserRole,
): AuthDb {
  async function sessionUser(user: AuthUser | null) {
    if (!resolveRole) return toSessionUser(user)
    if (!user || user.status !== "ATIVO") return null
    const role = await resolveRole(user)
    if (!role) return null
    return { id: user.id, name: user.nome, role }
  }

  return {
    async getUserByEmail(email) {
      const user = await prisma.usuarios.findUnique({
        where: { email },
        include: userInclude,
      })
      const session = await sessionUser(user)
      return user && session ? { ...session, passwordHash: user.senha } : null
    },
    async getUserById(id) {
      const userId = Number(id)
      if (!Number.isSafeInteger(userId) || userId <= 0) return null
      return sessionUser(
        await prisma.usuarios.findUnique({
          where: { id: userId },
          include: userInclude,
        }),
      )
    },
  }
}

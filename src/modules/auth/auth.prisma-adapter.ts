import "server-only"
import type { PrismaClient, Prisma } from "@/generated/prisma/client"
import type { AuthDb, Role } from "@/lib/auth-db"

import { resolveUserRole } from "./auth.role"

const userInclude = {
  usuario_empresa: {
    include: {
      empresas: { select: { status: true } },
      cargos: { select: { nome: true, status: true } },
      setores: { select: { nome: true, tipo: true, status: true } },
    },
  },
} satisfies Prisma.usuariosInclude

type AuthUser = Prisma.usuariosGetPayload<{ include: typeof userInclude }>

export type ResolveUserRole = (
  user: AuthUser,
) => Role | null | Promise<Role | null>

export function createPrismaAuthDb(
  prisma: Pick<PrismaClient, "usuarios">,
  resolveRole: ResolveUserRole = resolveUserRole,
): AuthDb {
  async function toSessionUser(user: AuthUser | null) {
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
      const session = await toSessionUser(user)
      return user && session ? { ...session, passwordHash: user.senha } : null
    },
    async getUserById(id) {
      const userId = Number(id)
      if (!Number.isSafeInteger(userId) || userId <= 0) return null
      return toSessionUser(
        await prisma.usuarios.findUnique({
          where: { id: userId },
          include: userInclude,
        }),
      )
    },
  }
}

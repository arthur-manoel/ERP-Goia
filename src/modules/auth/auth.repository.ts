import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { getAuthDb } from "@/lib/auth-db"
import {
  createPrismaAuthDb,
  toSessionUser,
  userInclude,
} from "./auth.prisma-adapter"

export function findUserByEmail(email: string) {
  return getAuthDb().getUserByEmail(email)
}

interface NewRefreshToken {
  userId: number
  sessionId: string
  tokenHash: string
  expiresAt: Date
}

function tokenData(data: NewRefreshToken) {
  return {
    id_usuario: data.userId,
    sessao_id: data.sessionId,
    // A coluna legada guarda somente o hash, nunca o token enviado ao cliente.
    token: data.tokenHash,
    data_criacao: new Date(),
    data_expiracao: data.expiresAt,
  }
}

const activeRefresh = (id_usuario: number, sessao_id: string) => ({
  id_usuario,
  sessao_id,
  revogado: false,
  data_expiracao: { gt: new Date() },
})

export async function findSessionUser(userId: number, sessionId: string) {
  const { prisma } = await import("@/lib/prisma")
  const current = await prisma.refresh_tokens.findFirst({
    where: activeRefresh(userId, sessionId),
    select: { usuarios: { include: userInclude } },
  })
  return current ? toSessionUser(current.usuarios) : null
}

export async function findSessionByRefreshHash(token: string) {
  const { prisma } = await import("@/lib/prisma")
  return prisma.refresh_tokens.findUnique({
    where: { token },
    select: { id_usuario: true, sessao_id: true },
  })
}

export async function lockUsers(
  tx: Prisma.TransactionClient,
  userIds: number[],
) {
  if (userIds.length === 0) return
  await tx.$queryRaw`SELECT id FROM usuarios WHERE id IN (${Prisma.join(userIds)}) ORDER BY id FOR UPDATE`
}

export function revokeUserSessions(
  tx: Prisma.TransactionClient,
  userIds: number[],
) {
  return tx.refresh_tokens.updateMany({
    where: { id_usuario: { in: userIds }, revogado: false },
    data: { revogado: true, data_revogacao: new Date() },
  })
}

function tokenOperations(tx: Prisma.TransactionClient) {
  return {
    findUserById: createPrismaAuthDb(tx).getUserById,
    findRefreshTokenByHash(token: string) {
      return tx.refresh_tokens.findUnique({ where: { token } })
    },
    findActiveRefresh(userId: number, sessionId: string) {
      return tx.refresh_tokens.findFirst({
        where: activeRefresh(userId, sessionId),
        select: { id: true },
      })
    },
    createRefreshToken(data: NewRefreshToken) {
      return tx.refresh_tokens.create({ data: tokenData(data) })
    },
    async rotateRefreshToken(oldId: number, data: NewRefreshToken) {
      const next = await tx.refresh_tokens.create({ data: tokenData(data) })
      await tx.refresh_tokens.update({
        where: { id: oldId },
        data: {
          revogado: true,
          data_revogacao: new Date(),
          replaced_by: next.id,
        },
      })
    },
    revokeAllUserTokens(userId: number) {
      return revokeUserSessions(tx, [userId])
    },
    revokeSession(id_usuario: number, sessao_id: string) {
      return tx.refresh_tokens.updateMany({
        where: { id_usuario, sessao_id, revogado: false },
        data: { revogado: true, data_revogacao: new Date() },
      })
    },
  }
}

export type RefreshTokenRepository = ReturnType<typeof tokenOperations>

/** Mantém emissão, rotação e revogação sob o mesmo bloqueio por usuário. */
export async function withUserTokens<T>(
  userId: number,
  operation: (repository: RefreshTokenRepository) => Promise<T>,
): Promise<T> {
  const { prisma } = await import("@/lib/prisma")
  return prisma.$transaction(
    async (tx) => {
      await lockUsers(tx, [userId])
      return operation(tokenOperations(tx))
    },
    { isolationLevel: "ReadCommitted" },
  )
}

export async function withRefreshToken<T>(
  tokenHash: string,
  operation: (repository: RefreshTokenRepository) => Promise<T>,
): Promise<T | null> {
  const owner = await findSessionByRefreshHash(tokenHash)
  if (!owner) return null
  return withUserTokens(owner.id_usuario, operation)
}

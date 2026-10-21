import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { getAuthDb, type SessionUser } from "@/lib/auth-db"

// O adapter existente resolve os perfis que não estão representados no schema Prisma.
export function findUserByEmail(email: string) {
  return getAuthDb().getUserByEmail(email)
}

export function findUserById(id: SessionUser["id"]) {
  return getAuthDb().getUserById(id)
}

async function lockUser(tx: Prisma.TransactionClient, userId: number) {
  await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${userId} FOR UPDATE`
}

interface NewRefreshToken {
  userId: number
  tokenHash: string
  expiresAt: Date
}

function tokenData(data: NewRefreshToken) {
  return {
    id_usuario: data.userId,
    // A coluna legada guarda somente o hash, nunca o token enviado ao cliente.
    token: data.tokenHash,
    data_criacao: new Date(),
    data_expiracao: data.expiresAt,
  }
}

function tokenOperations(tx: Prisma.TransactionClient) {
  return {
    findRefreshTokenByHash(tokenHash: string) {
      return tx.refresh_tokens.findUnique({ where: { token: tokenHash } })
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
      return next
    },
    revokeAllUserTokens(userId: number) {
      return tx.refresh_tokens.updateMany({
        where: { id_usuario: userId, revogado: false },
        data: { revogado: true, data_revogacao: new Date() },
      })
    },
    revokeRefreshTokenByHash(tokenHash: string) {
      return tx.refresh_tokens.updateMany({
        where: { token: tokenHash, revogado: false },
        data: { revogado: true, data_revogacao: new Date() },
      })
    },
  }
}

export type RefreshTokenRepository = ReturnType<typeof tokenOperations>

/** Mantém leitura, rotação e revogação sob o mesmo bloqueio por usuário. */
export async function withUserTokens<T>(
  userId: number,
  operation: (repository: RefreshTokenRepository) => Promise<T>,
): Promise<T> {
  const { prisma } = await import("@/lib/prisma")
  return prisma.$transaction(
    async (tx) => {
      await lockUser(tx, userId)
      return operation(tokenOperations(tx))
    },
    { isolationLevel: "ReadCommitted" },
  )
}

export async function withRefreshToken<T>(
  tokenHash: string,
  operation: (repository: RefreshTokenRepository) => Promise<T>,
): Promise<T | null> {
  const { prisma } = await import("@/lib/prisma")
  return prisma.$transaction(
    async (tx) => {
      const owner = await tx.refresh_tokens.findUnique({
        where: { token: tokenHash },
        select: { id_usuario: true },
      })
      if (!owner) return null
      await lockUser(tx, owner.id_usuario)
      return operation(tokenOperations(tx))
    },
    { isolationLevel: "ReadCommitted" },
  )
}

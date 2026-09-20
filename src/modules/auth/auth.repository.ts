import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { postgresqlNamespace } from "@/lib/database-config";
import { getAuthDb, type SessionUser } from "@/lib/auth-db";

// O adapter existente resolve os perfis que não estão representados no schema Prisma.
export function findUserByEmail(email: string) {
  return getAuthDb().getUserByEmail(email);
}

export function findUserById(id: SessionUser["id"]) {
  return getAuthDb().getUserById(id);
}

async function lockUser(tx: Prisma.TransactionClient, userId: number) {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(?:ql)?:/.test(url)) {
    const schema = postgresqlNamespace(url);
    // O identificador é validado; o ID continua parametrizado.
    await tx.$queryRawUnsafe(`SELECT id FROM "${schema}"."usuarios" WHERE id = $1 FOR UPDATE`, userId);
  } else {
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${userId} FOR UPDATE`;
  }
}

interface NewRefreshToken {
  userId: number;
  tokenHash: string;
  expiresAt: Date;
}

function tokenOperations(tx: Prisma.TransactionClient) {
  return {
    findRefreshTokenByHash(tokenHash: string) {
      return tx.refreshToken.findUnique({ where: { tokenHash } });
    },
    createRefreshToken(data: NewRefreshToken) {
      return tx.refreshToken.create({ data });
    },
    async rotateRefreshToken(oldId: string, data: NewRefreshToken) {
      const next = await tx.refreshToken.create({ data });
      await tx.refreshToken.update({
        where: { id: oldId }, data: { revoked: true, replacedBy: next.id },
      });
      return next;
    },
    revokeAllUserTokens(userId: number) {
      return tx.refreshToken.updateMany({
        where: { userId, revoked: false }, data: { revoked: true },
      });
    },
    revokeRefreshTokenByHash(tokenHash: string) {
      return tx.refreshToken.updateMany({ where: { tokenHash }, data: { revoked: true } });
    },
  };
}

export type RefreshTokenRepository = ReturnType<typeof tokenOperations>;

/** Mantém leitura, rotação e revogação sob o mesmo bloqueio por usuário. */
export async function withUserTokens<T>(
  userId: number,
  operation: (repository: RefreshTokenRepository) => Promise<T>,
): Promise<T> {
  const { prisma } = await import("@/lib/prisma");
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    return operation(tokenOperations(tx));
  }, { isolationLevel: "ReadCommitted" });
}

export async function withRefreshToken<T>(
  tokenHash: string,
  operation: (repository: RefreshTokenRepository) => Promise<T>,
): Promise<T | null> {
  const { prisma } = await import("@/lib/prisma");
  return prisma.$transaction(async (tx) => {
    const owner = await tx.refreshToken.findUnique({ where: { tokenHash }, select: { userId: true } });
    if (!owner) return null;
    await lockUser(tx, owner.userId);
    return operation(tokenOperations(tx));
  }, { isolationLevel: "ReadCommitted" });
}

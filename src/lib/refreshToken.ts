import "server-only";
import { createHash, randomBytes } from "node:crypto";

export const REFRESH_TOKEN_SECONDS = 7 * 24 * 60 * 60;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const generate = () => randomBytes(32).toString("hex");
const expiresAt = () => new Date(Date.now() + REFRESH_TOKEN_SECONDS * 1000);

export async function issueRefreshToken(userId: string | number): Promise<string> {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("ID de usuário inválido.");
  const { prisma } = await import("./prisma");
  const token = generate();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${id} FOR UPDATE`;
    await tx.refreshToken.create({ data: { userId: id, tokenHash: hash(token), expiresAt: expiresAt() } });
  });
  return token;
}

export async function rotateRefreshToken(oldToken: string): Promise<{ token: string; userId: number } | null> {
  const { prisma } = await import("./prisma");
  return prisma.$transaction(async (tx) => {
    const tokenHash = hash(oldToken);
    const owner = await tx.refreshToken.findUnique({ where: { tokenHash }, select: { userId: true } });
    if (!owner) return null;
    // Todas as operações do usuário usam o mesmo bloqueio, inclusive tokens distintos.
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${owner.userId} FOR UPDATE`;
    const old = await tx.refreshToken.findUnique({ where: { tokenHash } });
    if (!old) return null;
    if (old.replacedBy) {
      await tx.refreshToken.updateMany({ where: { userId: old.userId, revoked: false }, data: { revoked: true } });
      // Não lançar dentro da transação: a revogação precisa ser confirmada.
      return null;
    }
    if (old.revoked || old.expiresAt.getTime() <= Date.now()) return null;
    const token = generate();
    const next = await tx.refreshToken.create({
      data: { userId: old.userId, tokenHash: hash(token), expiresAt: expiresAt() },
    });
    await tx.refreshToken.update({ where: { id: old.id }, data: { revoked: true, replacedBy: next.id } });
    return { token, userId: old.userId };
  }, { isolationLevel: "ReadCommitted" });
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const { prisma } = await import("./prisma");
  await prisma.$transaction(async (tx) => {
    const tokenHash = hash(token);
    const owner = await tx.refreshToken.findUnique({ where: { tokenHash }, select: { userId: true } });
    if (!owner) return;
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${owner.userId} FOR UPDATE`;
    await tx.refreshToken.updateMany({ where: { tokenHash }, data: { revoked: true } });
  }, { isolationLevel: "ReadCommitted" });
}

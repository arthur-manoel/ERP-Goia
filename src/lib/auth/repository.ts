import { prisma } from "../prisma";
import type { Prisma } from "../../generated/prisma/client";

const publicUserSelect = { id: true, nome: true, email: true } as const;
export async function findUsuario(email: string) {
  return prisma.usuarios.findUnique({ where: { email },
    select: { ...publicUserSelect, senha: true, status: true } });
}
export async function createSession(id_usuario: number, token: string, expiration: Date) {
  return prisma.refresh_tokens.create({ data: {
    id_usuario, token, data_criacao: new Date(), data_expiracao: expiration,
  } });
}

// A callback é exportada para testar a transição atômica sem acessar um banco real.
export async function rotateInTransaction(tx: Prisma.TransactionClient, hash: string, nextHash: string, now: Date) {
  const current = await tx.refresh_tokens.findUnique({ where: { token: hash },
    include: { usuarios: { select: { ...publicUserSelect, status: true } } } });
  if (!current || current.data_expiracao <= now) return null;
  if (current.revogado || current.usuarios.status !== "ATIVO") {
    // Não lançar dentro da transação: isso desfaria a revogação por reutilização.
    await tx.refresh_tokens.updateMany({ where: { id_usuario: current.id_usuario, revogado: false },
      data: { revogado: true, data_revogacao: now } });
    return null;
  }
  const consumed = await tx.refresh_tokens.updateMany({
    where: { id: current.id, revogado: false, data_expiracao: { gt: now } },
    data: { revogado: true, data_revogacao: now },
  });
  if (consumed.count !== 1) {
    await tx.refresh_tokens.updateMany({ where: { id_usuario: current.id_usuario, revogado: false },
      data: { revogado: true, data_revogacao: now } });
    return null;
  }
  const session = await tx.refresh_tokens.create({ data: {
    id_usuario: current.id_usuario, token: nextHash, data_criacao: now,
    data_expiracao: current.data_expiracao,
  } });
  return { session, usuario: { id: current.usuarios.id, nome: current.usuarios.nome, email: current.usuarios.email } };
}
export async function rotateSession(hash: string, nextHash: string) {
  return prisma.$transaction((tx) => rotateInTransaction(tx, hash, nextHash, new Date()));
}
export async function revokeSession(hash: string) {
  await prisma.refresh_tokens.updateMany({ where: { token: hash, revogado: false },
    data: { revogado: true, data_revogacao: new Date() } });
}
export async function findActiveSession(id: number, id_usuario: number) {
  return prisma.refresh_tokens.findFirst({ where: {
    id, id_usuario, revogado: false, data_expiracao: { gt: new Date() }, usuarios: { status: "ATIVO" },
  }, select: { usuarios: { select: publicUserSelect } } });
}

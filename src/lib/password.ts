import "server-only";
import { argon2id, hash, verify } from "argon2";

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id });
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Um hash inválido nunca deve autenticar o usuário.
    return false;
  }
}

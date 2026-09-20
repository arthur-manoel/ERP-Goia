import "server-only";
import { createHash, randomBytes } from "node:crypto";
import * as repository from "./auth.repository";
import type { LoginInput } from "./auth.schema";
import { argon2id, hash, verify } from "argon2";
import jwt from "jsonwebtoken";
import type { Role } from "@/lib/auth-db";

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


export interface AccessTokenPayload {
  id: string | number;
  role: Role;
}

const roles: Role[] = ["ADMINISTRACAO", "PRODUCAO", "VENDAS", "FINANCEIRO"];

function secret() {
  const value = process.env.ACCESS_TOKEN_SECRET;
  if (!value) throw new Error("Defina ACCESS_TOKEN_SECRET no ambiente.");
  return value;
}

function validPayload(value: unknown): value is AccessTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as AccessTokenPayload;
  return ((typeof payload.id === "string" && payload.id.length > 0)
    || (typeof payload.id === "number" && Number.isSafeInteger(payload.id) && payload.id > 0))
    && roles.includes(payload.role);
}

export function signAccessToken(payload: AccessTokenPayload): string {
  if (!validPayload(payload)) throw new Error("Payload de acesso inválido.");
  return jwt.sign({ id: payload.id, role: payload.role }, secret(), {
    algorithm: "HS256", expiresIn: "15m",
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const key = secret();
  try {
    const payload = jwt.verify(token, key, { algorithms: ["HS256"] });
    if (typeof payload === "string" || typeof payload.exp !== "number" || !validPayload(payload)) return null;
    return { id: payload.id, role: payload.role };
  } catch {
    return null;
  }
}

export const REFRESH_TOKEN_SECONDS = 7 * 24 * 60 * 60;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const generate = () => randomBytes(32).toString("hex");
const expiresAt = () => new Date(Date.now() + REFRESH_TOKEN_SECONDS * 1000);

export async function issueRefreshToken(userId: string | number): Promise<string> {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("ID de usuário inválido.");
  const token = generate();
  await repository.withUserTokens(id, (tokens) =>
    tokens.createRefreshToken({ userId: id, tokenHash: tokenHash(token), expiresAt: expiresAt() }));
  return token;
}

export async function rotateRefreshToken(oldToken: string): Promise<{ token: string; userId: number } | null> {
  const hash = tokenHash(oldToken);
  return repository.withRefreshToken(hash, async (tokens) => {
    const old = await tokens.findRefreshTokenByHash(hash);
    if (!old) return null;
    if (old.replaced_by) {
      await tokens.revokeAllUserTokens(old.id_usuario);
      // Retornar confirma a revogação; lançar faria rollback da transação.
      return null;
    }
    if (old.revogado || old.data_expiracao.getTime() <= Date.now()) return null;
    const token = generate();
    await tokens.rotateRefreshToken(old.id, {
      userId: old.id_usuario, tokenHash: tokenHash(token), expiresAt: expiresAt(),
    });
    return { token, userId: old.id_usuario };
  });
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const hash = tokenHash(token);
  await repository.withRefreshToken(hash, (tokens) => tokens.revokeRefreshTokenByHash(hash));
}

// Também verificar um hash quando o e-mail não existe reduz diferenças de tempo.
let dummyHash: Promise<string> | undefined;

export async function login(input: LoginInput, previousToken?: string) {
  const user = await repository.findUserByEmail(input.email);
  const passwordHash = user?.passwordHash ?? await (dummyHash ??= hashPassword("invalid-login"));
  const valid = await verifyPassword(input.password, passwordHash);
  if (!user || !valid) return null;
  const accessToken = signAccessToken(user);
  if (previousToken) await revokeRefreshToken(previousToken);
  const refreshToken = await issueRefreshToken(user.id);
  return { id: user.id, name: user.name, role: user.role, accessToken, refreshToken };
}

export async function refresh(token?: string) {
  const rotated = token ? await rotateRefreshToken(token) : null;
  const user = rotated ? await repository.findUserById(rotated.userId) : null;
  if (!rotated || !user) {
    if (rotated) await revokeRefreshToken(rotated.token);
    return null;
  }
  return { accessToken: signAccessToken(user), refreshToken: rotated.token };
}

export async function logout(token?: string): Promise<void> {
  if (token) await revokeRefreshToken(token);
}

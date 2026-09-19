import "server-only";
import jwt from "jsonwebtoken";
import type { Role } from "./auth-db";

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

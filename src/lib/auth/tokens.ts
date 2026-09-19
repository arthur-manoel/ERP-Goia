import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, errors } from "jose";
import { UnauthorizedError } from "../api/errors";

export const ACCESS_SECONDS = 15 * 60;
export const REFRESH_SECONDS = 7 * 24 * 60 * 60;
const issuer = "erp-goia";
const audience = "erp-goia-session";

export function signingKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Configure AUTH_SECRET com pelo menos 32 bytes aleatórios.");
  return new TextEncoder().encode(secret);
}
export function newRefreshToken() { return randomBytes(32).toString("base64url"); }
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export async function signAccessToken(usuarioId: number, sessionId: number) {
  return new SignJWT({ sid: sessionId, type: "access" }).setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer).setAudience(audience).setSubject(String(usuarioId))
    .setIssuedAt().setExpirationTime(`${ACCESS_SECONDS}s`).sign(signingKey());
}
export async function verifyAccessToken(token: string) {
  const key = signingKey();
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"], issuer, audience, requiredClaims: ["sub", "exp", "iat"],
    });
    const usuarioId = Number(payload.sub);
    if (payload.type !== "access" || !Number.isSafeInteger(usuarioId) || usuarioId <= 0 ||
      !Number.isSafeInteger(payload.sid) || Number(payload.sid) <= 0) throw new UnauthorizedError();
    return { usuarioId, sessionId: Number(payload.sid) };
  } catch (error) {
    if (error instanceof errors.JOSEError) throw new UnauthorizedError();
    throw error;
  }
}

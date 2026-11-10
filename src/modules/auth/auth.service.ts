import "server-only"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import * as repository from "./auth.repository"
import type { LoginInput } from "./auth.schema"
import { argon2id, hash, verify } from "argon2"
import jwt from "jsonwebtoken"
import type { Role } from "@/lib/auth-db"
import { HttpError } from "@/lib/api/errors"

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { type: argon2id })
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

export interface AccessTokenPayload {
  id: string | number
  role: Role
  sid: string
}

const roles: Role[] = ["ADMINISTRACAO", "PRODUCAO", "VENDAS", "FINANCEIRO"]
const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function secret() {
  const value = process.env.ACCESS_TOKEN_SECRET
  if (!value) throw new Error("Defina ACCESS_TOKEN_SECRET no ambiente.")
  return value
}

function validUserId(value: unknown): boolean {
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && /^[1-9]\d*$/.test(value))
  )
    return false
  const id = Number(value)
  return Number.isInteger(id) && id > 0 && id <= 2_147_483_647
}

function validPayload(value: unknown): value is AccessTokenPayload {
  if (!value || typeof value !== "object") return false
  const payload = value as AccessTokenPayload
  return (
    validUserId(payload.id) &&
    roles.includes(payload.role) &&
    typeof payload.sid === "string" &&
    sessionIdPattern.test(payload.sid)
  )
}

export function signAccessToken(payload: AccessTokenPayload): string {
  if (!validPayload(payload)) throw new Error("Payload de acesso inválido.")
  const { id, role, sid } = payload
  return jwt.sign({ id, role, sid }, secret(), {
    algorithm: "HS256",
    expiresIn: "15m",
  })
}

function readAccessToken(
  token: string,
  ignoreExpiration = false,
): AccessTokenPayload | null {
  const key = secret()
  try {
    const payload = jwt.verify(token, key, {
      algorithms: ["HS256"],
      ignoreExpiration,
    })
    if (
      typeof payload === "string" ||
      typeof payload.exp !== "number" ||
      !validPayload(payload)
    )
      return null
    return { id: payload.id, role: payload.role, sid: payload.sid }
  } catch {
    return null
  }
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenPayload | null> {
  const claims = readAccessToken(token)
  if (!claims) return null
  const user = await repository.findSessionUser(Number(claims.id), claims.sid)
  return user?.role === claims.role ? claims : null
}

export const REFRESH_TOKEN_SECONDS = 7 * 24 * 60 * 60
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex")
const generate = () => randomBytes(32).toString("hex")
const expiresAt = () => new Date(Date.now() + REFRESH_TOKEN_SECONDS * 1000)

export async function issueRefreshToken(
  userId: string | number,
): Promise<string> {
  if (!validUserId(userId)) throw new Error("ID de usuário inválido.")
  const id = Number(userId)
  const token = generate()
  await repository.withUserTokens(id, (tokens) =>
    tokens.createRefreshToken({
      userId: id,
      sessionId: randomUUID(),
      tokenHash: tokenHash(token),
      expiresAt: expiresAt(),
    }),
  )
  return token
}

export async function rotateRefreshToken(
  oldToken: string,
  expected?: AccessTokenPayload,
) {
  const hash = tokenHash(oldToken)
  return repository.withRefreshToken(hash, async (tokens) => {
    const old = await tokens.findRefreshTokenByHash(hash)
    if (!old) return null
    if (
      expected &&
      (old.sessao_id !== expected.sid || old.id_usuario !== Number(expected.id))
    )
      throw new HttpError(401, "A sessão do navegador mudou.")
    if (!old.sessao_id) return null
    if (old.replaced_by) {
      // Reuso de uma sessão ainda ativa revoga todas as sessões do usuário.
      if (await tokens.findActiveRefresh(old.id_usuario, old.sessao_id))
        await tokens.revokeAllUserTokens(old.id_usuario)
      return null
    }
    if (old.revogado || old.data_expiracao.getTime() <= Date.now()) return null
    const user = await tokens.findUserById(old.id_usuario)
    if (!user || (expected && expected.role !== user.role)) {
      await tokens.revokeSession(old.id_usuario, old.sessao_id)
      return null
    }
    const token = generate()
    const accessToken = signAccessToken({ ...user, sid: old.sessao_id })
    await tokens.rotateRefreshToken(old.id, {
      userId: old.id_usuario,
      sessionId: old.sessao_id,
      tokenHash: tokenHash(token),
      expiresAt: expiresAt(),
    })
    return { token, userId: old.id_usuario, accessToken }
  })
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const hash = tokenHash(token)
  await repository.withRefreshToken(hash, async (tokens) => {
    const refresh = await tokens.findRefreshTokenByHash(hash)
    if (refresh?.sessao_id)
      await tokens.revokeSession(refresh.id_usuario, refresh.sessao_id)
  })
}

// Também verificar um hash quando o e-mail não existe reduz diferenças de tempo.
let dummyHash: Promise<string> | undefined

export async function login(input: LoginInput, previousToken?: string) {
  const user = await repository.findUserByEmail(input.email)
  const passwordHash =
    user?.passwordHash ?? (await (dummyHash ??= hashPassword("invalid-login")))
  const valid = await verifyPassword(input.password, passwordHash)
  if (!user || !valid) return null
  if (previousToken) await revokeRefreshToken(previousToken)
  const id = Number(user.id)
  return repository.withUserTokens(id, async (tokens) => {
    const current = await tokens.findUserById(id)
    if (!current) return null
    const sid = randomUUID()
    const accessToken = signAccessToken({ ...current, sid })
    const refreshToken = generate()
    await tokens.createRefreshToken({
      userId: id,
      sessionId: sid,
      tokenHash: tokenHash(refreshToken),
      expiresAt: expiresAt(),
    })
    return { ...current, accessToken, refreshToken }
  })
}

export async function refresh(token?: string, accessToken?: string) {
  // A assinatura vincula o cookie à aba que pediu a renovação mesmo após expirar.
  const expected = accessToken ? readAccessToken(accessToken, true) : null
  if (accessToken !== undefined && !expected)
    throw new HttpError(401, "Não autenticado.")
  const rotated = token
    ? await rotateRefreshToken(token, expected ?? undefined)
    : null
  if (!rotated) return null
  return { accessToken: rotated.accessToken, refreshToken: rotated.token }
}

export async function logout(
  token?: string,
  accessToken?: string,
): Promise<void> {
  const claims = accessToken ? readAccessToken(accessToken, true) : null
  const cookieSession = token
    ? await repository.findSessionByRefreshHash(tokenHash(token))
    : null

  if (
    claims &&
    cookieSession &&
    (cookieSession.sessao_id !== claims.sid ||
      cookieSession.id_usuario !== Number(claims.id))
  )
    throw new HttpError(409, "A sessão do navegador mudou.")

  if (cookieSession) {
    if (cookieSession.sessao_id) {
      const { id_usuario, sessao_id } = cookieSession
      await repository.withUserTokens(id_usuario, (tokens) =>
        tokens.revokeSession(id_usuario, sessao_id),
      )
    }
    return
  }
  if (accessToken === undefined) return
  const valid = readAccessToken(accessToken)
  if (!valid) throw new HttpError(401, "Não foi possível identificar a sessão.")
  await repository.withUserTokens(Number(valid.id), (tokens) =>
    tokens.revokeSession(Number(valid.id), valid.sid),
  )
}

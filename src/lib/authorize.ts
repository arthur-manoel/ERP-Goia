import "server-only"
import type { Role } from "./auth-db"
import { verifyAccessToken, type AccessTokenPayload } from "./jwt"

export type { Role } from "./auth-db"

export async function requireRole(
  req: Request,
  allowed: Role[],
): Promise<
  | { user: AccessTokenPayload; error?: never }
  | { error: Response; user?: never }
> {
  const match = /^Bearer ([^\s]+)$/i.exec(
    req.headers.get("Authorization") ?? "",
  )
  const user = match ? verifyAccessToken(match[1]) : null
  if (!user) {
    return {
      error: Response.json({ error: "Não autenticado." }, { status: 401 }),
    }
  }
  if (!allowed.includes(user.role)) {
    return {
      error: Response.json({ error: "Acesso negado." }, { status: 403 }),
    }
  }
  return { user }
}

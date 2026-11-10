import "server-only"
import type { Role } from "./auth-db"
import { verifyAccessToken, type AccessTokenPayload } from "./jwt"

export type { Role } from "./auth-db"

export function readBearer(request: Request) {
  const header = request.headers.get("Authorization")
  if (header === null) return undefined
  return /^Bearer ([^\s]+)$/i.exec(header)?.[1] ?? ""
}

export async function requireRole(
  req: Request,
  allowed: Role[],
): Promise<
  | { user: Pick<AccessTokenPayload, "id" | "role">; error?: never }
  | { error: Response; user?: never }
> {
  const bearer = readBearer(req)
  let user: AccessTokenPayload | null
  try {
    user = bearer ? await verifyAccessToken(bearer) : null
  } catch {
    console.error("Falha ao validar a sessão.")
    return {
      error: Response.json(
        { error: "Não foi possível validar a sessão." },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      ),
    }
  }
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
  return { user: { id: user.id, role: user.role } }
}

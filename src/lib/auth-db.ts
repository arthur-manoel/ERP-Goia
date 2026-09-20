import "server-only"

export type Role = "ADMINISTRACAO" | "PRODUCAO" | "VENDAS" | "FINANCEIRO"

export interface SessionUser {
  id: string | number
  name: string
  role: Role
}

/** O adapter externo resolve identidade e perfis; refresh tokens usam Prisma. */
export interface AuthDb {
  getUserByEmail(
    email: string,
  ): Promise<(SessionUser & { passwordHash: string }) | null>
  getUserById(id: SessionUser["id"]): Promise<SessionUser | null>
}

const authState = globalThis as typeof globalThis & { authDb?: AuthDb }

/** Configure no bootstrap do servidor, em cada processo, com o adapter externo. */
export function configureAuthDb(db: AuthDb): void {
  authState.authDb = db
}

export function getAuthDb(): AuthDb {
  if (!authState.authDb) {
    throw new Error(
      "Configure o adapter de autenticação com configureAuthDb(db).",
    )
  }
  return authState.authDb
}

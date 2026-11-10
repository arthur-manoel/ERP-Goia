import "server-only"
import { cookies } from "next/headers"
import { REFRESH_TOKEN_SECONDS, login, refresh, logout } from "./auth.service"
import { loginSchema } from "./auth.schema"
import { readBearer } from "@/lib/authorize"
import { HttpError } from "@/lib/api/errors"

export const REFRESH_COOKIE = "refresh_token"
const headers = { "Cache-Control": "no-store" }

function sessionError(error: unknown, message: string) {
  if (error instanceof HttpError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers },
    )
  console.error(message)
  return Response.json({ error: message }, { status: 500, headers })
}

export async function setRefreshCookie(token: string) {
  const jar = await cookies()
  jar.set(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: token ? REFRESH_TOKEN_SECONDS : 0,
    ...(!token ? { expires: new Date(0) } : {}),
  })
  // Remover o cookie legado durante a transição.
  jar.set("session_id", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })
}

export async function loginHandler(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 })
  }
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: "Informe e-mail e senha válidos." },
      { status: 400 },
    )
  }
  const result = await login(
    parsed.data,
    (await cookies()).get(REFRESH_COOKIE)?.value,
  )
  if (!result) {
    return Response.json(
      { error: "E-mail ou senha inválidos." },
      { status: 401 },
    )
  }
  const { refreshToken, ...response } = result
  await setRefreshCookie(refreshToken)
  return Response.json(response, { headers: { "Cache-Control": "no-store" } })
}

export async function refreshHandler(request: Request) {
  try {
    const result = await refresh(
      (await cookies()).get(REFRESH_COOKIE)?.value,
      readBearer(request),
    )
    await setRefreshCookie(result?.refreshToken ?? "")
    if (!result)
      return Response.json(
        { error: "Não autenticado." },
        { status: 401, headers },
      )
    return Response.json({ accessToken: result.accessToken }, { headers })
  } catch (error) {
    return sessionError(error, "Não foi possível renovar a sessão.")
  }
}

export async function logoutHandler(request: Request) {
  try {
    await logout(
      (await cookies()).get(REFRESH_COOKIE)?.value,
      readBearer(request),
    )
    await setRefreshCookie("")
    return Response.json({ ok: true }, { headers })
  } catch (error) {
    return sessionError(error, "Não foi possível encerrar a sessão.")
  }
}

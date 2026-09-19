import "server-only";
import { cookies } from "next/headers";
import { REFRESH_TOKEN_SECONDS } from "./refreshToken";

export const REFRESH_COOKIE = "refresh_token";

export async function setRefreshCookie(token: string) {
  const jar = await cookies();
  jar.set(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: token ? REFRESH_TOKEN_SECONDS : 0,
    ...(!token ? { expires: new Date(0) } : {}),
  });
  // Remover o cookie legado durante a transição.
  jar.set("session_id", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

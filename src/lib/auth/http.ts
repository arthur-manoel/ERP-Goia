import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, handleRequest } from "../api/http";
import { authenticate } from "./service";
import { ACCESS_SECONDS } from "./tokens";

export const ACCESS_COOKIE = "erp_access";
export const REFRESH_COOKIE = "erp_refresh";
export function requestCookies(request: Request) {
  // Copiar somente os headers preserva o stream do JSON para o handler.
  return request instanceof NextRequest ? request.cookies : new NextRequest(request.url, { headers: request.headers }).cookies;
}
export function setSessionCookies(response: NextResponse, session: {
  accessToken: string; refreshToken: string; expiresAt: Date;
}) {
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const };
  response.cookies.set(ACCESS_COOKIE, session.accessToken, { ...options, path: "/", maxAge: ACCESS_SECONDS });
  response.cookies.set(REFRESH_COOKIE, session.refreshToken, { ...options, path: "/api/auth", expires: session.expiresAt });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
export function clearSessionCookies(response: NextResponse) {
  const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, maxAge: 0 };
  response.cookies.set(ACCESS_COOKIE, "", { ...options, path: "/" });
  response.cookies.set(REFRESH_COOKIE, "", { ...options, path: "/api/auth" });
  return response;
}
export async function requireUser(request: Request) {
  assertSameOrigin(request);
  return authenticate(requestCookies(request).get(ACCESS_COOKIE)?.value);
}
export async function authenticated<T>(request: Request,
  operation: (usuario: Awaited<ReturnType<typeof authenticate>>) => Promise<T>, status = 200) {
  return handleRequest(async () => operation(await requireUser(request)), status);
}

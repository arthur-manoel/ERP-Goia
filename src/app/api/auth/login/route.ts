import { getAuthDb } from "@/lib/auth-db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { cookies } from "next/headers";
import { signAccessToken } from "@/lib/jwt";
import { issueRefreshToken, revokeRefreshToken } from "@/lib/refreshToken";
import { REFRESH_COOKIE, setRefreshCookie } from "@/lib/auth-cookies";

export const runtime = "nodejs";

// Também verificar um hash quando o e-mail não existe reduz diferenças de tempo.
let dummyHash: Promise<string> | undefined;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !("email" in body) || !("password" in body)
    || typeof body.email !== "string" || typeof body.password !== "string"
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())
    || body.email.length > 254 || !body.password.length || body.password.length > 1024) {
    return Response.json({ error: "Informe e-mail e senha válidos." }, { status: 400 });
  }

  const db = getAuthDb();
  const user = await db.getUserByEmail(body.email.trim());
  const passwordHash = user?.passwordHash ?? await (dummyHash ??= hashPassword("invalid-login"));
  const valid = await verifyPassword(body.password, passwordHash);
  if (!user || !valid) {
    return Response.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  }

  const accessToken = signAccessToken(user);
  const previous = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (previous) await revokeRefreshToken(previous);
  const refreshToken = await issueRefreshToken(user.id);
  await setRefreshCookie(refreshToken);
  return Response.json({ id: user.id, name: user.name, role: user.role, accessToken }, {
    headers: { "Cache-Control": "no-store" },
  });
}

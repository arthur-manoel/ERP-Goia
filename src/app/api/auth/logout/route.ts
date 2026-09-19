import { cookies } from "next/headers";
import { revokeRefreshToken } from "@/lib/refreshToken";
import { REFRESH_COOKIE, setRefreshCookie } from "@/lib/auth-cookies";

export const runtime = "nodejs";

export async function POST() {
  const token = (await cookies()).get(REFRESH_COOKIE)?.value;
  if (token) await revokeRefreshToken(token);
  await setRefreshCookie("");
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

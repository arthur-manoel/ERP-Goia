import { cookies } from "next/headers";
import { getAuthDb } from "@/lib/auth-db";
import { signAccessToken } from "@/lib/jwt";
import { rotateRefreshToken, revokeRefreshToken } from "@/lib/refreshToken";
import { REFRESH_COOKIE, setRefreshCookie } from "@/lib/auth-cookies";

export const runtime = "nodejs";

export async function POST() {
  const token = (await cookies()).get(REFRESH_COOKIE)?.value;
  const rotated = token ? await rotateRefreshToken(token) : null;
  const user = rotated ? await getAuthDb().getUserById(rotated.userId) : null;
  if (!rotated || !user) {
    if (rotated) await revokeRefreshToken(rotated.token);
    await setRefreshCookie("");
    return Response.json({ error: "Não autenticado." }, {
      status: 401, headers: { "Cache-Control": "no-store" },
    });
  }
  const accessToken = signAccessToken(user);
  await setRefreshCookie(rotated.token);
  return Response.json({ accessToken }, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse } from "../../../../lib/api/http";
import { logout } from "../../../../lib/auth/service";
import { clearSessionCookies, REFRESH_COOKIE, requestCookies } from "../../../../lib/auth/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const data = await logout(requestCookies(request).get(REFRESH_COOKIE)?.value);
    const response = NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store" } });
    return clearSessionCookies(response);
  } catch (error) { return errorResponse(error); }
}

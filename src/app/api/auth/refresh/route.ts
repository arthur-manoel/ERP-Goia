import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse } from "../../../../lib/api/http";
import { UnauthorizedError } from "../../../../lib/api/errors";
import { refresh } from "../../../../lib/auth/service";
import { clearSessionCookies, REFRESH_COOKIE, requestCookies, setSessionCookies } from "../../../../lib/auth/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const session = await refresh(requestCookies(request).get(REFRESH_COOKIE)?.value);
    return setSessionCookies(NextResponse.json({ success: true, data: { usuario: session.usuario } }), session);
  } catch (error) {
    const response = errorResponse(error);
    return error instanceof UnauthorizedError ? clearSessionCookies(response) : response;
  }
}

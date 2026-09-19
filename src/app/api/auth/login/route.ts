import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson, validate } from "../../../../lib/api/http";
import { login } from "../../../../lib/auth/service";
import { setSessionCookies } from "../../../../lib/auth/http";
import { loginSchema } from "../../../../lib/auth/schema";
import { limitLogin } from "../../../../lib/auth/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = validate(loginSchema, await readJson(request));
    limitLogin(input.email);
    const session = await login(input);
    return setSessionCookies(NextResponse.json({ success: true, data: { usuario: session.usuario } }), session);
  } catch (error) { return errorResponse(error); }
}

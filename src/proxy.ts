import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "./lib/auth/http";
import { errorResponse } from "./lib/api/http";
import { UnauthorizedError } from "./lib/api/errors";

const publicPaths = new Set(["/login", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout"]);
export async function proxy(request: NextRequest) {
  if (publicPaths.has(request.nextUrl.pathname)) return NextResponse.next();
  try {
    await requireUser(request);
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof UnauthorizedError && !request.nextUrl.pathname.startsWith("/api/")) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
    return errorResponse(error);
  }
}
export const config = {
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

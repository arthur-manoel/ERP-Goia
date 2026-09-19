import { NextRequest } from "next/server";
import { signAccessToken } from "../../src/lib/auth/tokens";

export const origin = "http://localhost:3000";
export async function request(path: string, method = "GET", body?: unknown, loggedIn = true) {
  const headers = new Headers({ origin });
  if (loggedIn) headers.set("cookie", `erp_access=${await signAccessToken(1, 1)}`);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(origin + path, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body) });
}
export function context(id = "1") { return { params: Promise.resolve({ id }) }; }

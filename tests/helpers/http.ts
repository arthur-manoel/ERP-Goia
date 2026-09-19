import { NextRequest } from "next/server";

export const origin = "http://localhost:3000";
export async function request(path: string, method = "GET", body?: unknown) {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  return new NextRequest(origin + path, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body) });
}
export function context(id = "1") { return { params: Promise.resolve({ id }) }; }

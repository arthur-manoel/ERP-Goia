import { afterEach, expect, it, vi } from "vitest";
import { authFetch } from "../../../src/lib/auth/client";
afterEach(() => vi.unstubAllGlobals());
it("duas chamadas 401 compartilham uma rotação e repetem os corpos originais", async () => {
  vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
  vi.stubGlobal("navigator", {});
  let refreshed = false;
  const bodies: string[] = [];
  const fetchMock = vi.fn(async (input: Request | string) => {
    const path = typeof input === "string" ? input : new URL(input.url).pathname;
    if (path === "/api/auth/me") return new Response(null, { status: 401 });
    if (path === "/api/auth/refresh") { refreshed = true; return new Response(null, { status: 200 }); }
    if (input instanceof Request) bodies.push(await input.text());
    return new Response(null, { status: refreshed ? 200 : 401 });
  });
  vi.stubGlobal("fetch", fetchMock);
  const init = { method: "POST", body: JSON.stringify({ nome: "M" }) };
  const responses = await Promise.all([authFetch("/api/tamanhos", init), authFetch("/api/tamanhos", init)]);
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  expect(fetchMock.mock.calls.filter(([url]) => url === "/api/auth/refresh")).toHaveLength(1);
  expect(bodies).toEqual(Array(4).fill(init.body));
});
it("não entra em loop quando refresh é recusado", async () => {
  vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
  vi.stubGlobal("navigator", {});
  const fetchMock = vi.fn(async () => new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", fetchMock);
  expect((await authFetch("/api/tamanhos")).status).toBe(401);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
it("não envia credenciais a outro domínio", async () => {
  vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await expect(authFetch("https://outro.example/api/tamanhos")).rejects.toThrow("mesma origem");
  expect(fetchMock).not.toHaveBeenCalled();
});

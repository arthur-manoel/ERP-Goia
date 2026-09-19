import { expect, it } from "vitest";
import { proxy } from "../../../src/proxy";
import { request } from "../../helpers/http";
import { db } from "../../helpers/prisma";
it("protege APIs presentes e futuras", async () => {
  for (const path of ["/api/produtos", "/api/tamanhos", "/api/futura"]) {
    expect((await proxy(await request(path, "GET", undefined, false))).status).toBe(401);
  }
});
it("redireciona páginas sem sessão para login mantendo destino", async () => {
  const response = await proxy(await request("/", "GET", undefined, false));
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe("http://localhost:3000/login?next=%2F");
});
it("libera login/refresh/logout sem exigir access token", async () => {
  for (const path of ["/login", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout"]) {
    expect((await proxy(await request(path, "GET", undefined, false))).headers.get("x-middleware-next")).toBe("1");
  }
  expect(db.refresh_tokens.findFirst).not.toHaveBeenCalled();
});
it("libera sessão autenticada e evita cache", async () => {
  const response = await proxy(await request("/"));
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(response.headers.get("cache-control")).toBe("no-store");
});

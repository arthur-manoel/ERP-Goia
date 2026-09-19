import { expect, it } from "vitest";
import * as collection from "../../../src/app/api/produtos/route";
import * as item from "../../../src/app/api/produtos/[id]/route";
import { request, context } from "../../helpers/http";
it("aplica autenticação também nas cinco operações de produtos", async () => {
  expect((await collection.GET(await request("/api/produtos", "GET", undefined, false))).status).toBe(401);
  expect((await collection.POST(await request("/api/produtos", "POST", {}, false))).status).toBe(401);
  expect((await item.GET(await request("/api/produtos/1", "GET", undefined, false), context())).status).toBe(401);
  expect((await item.PUT(await request("/api/produtos/1", "PUT", {}, false), context())).status).toBe(401);
  expect((await item.DELETE(await request("/api/produtos/1", "DELETE", undefined, false), context())).status).toBe(401);
});

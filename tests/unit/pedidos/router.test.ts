import { beforeEach, expect, it, vi } from "vitest"
import { PedidoError } from "../../../src/modules/pedidos/pedidos.error"
import * as routes from "../../../src/modules/pedidos/router"
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  criarPedido: vi.fn(),
  listarPedidos: vi.fn(),
  consultarPedido: vi.fn(),
  editarPedido: vi.fn(),
  incluirItem: vi.fn(),
  editarItem: vi.fn(),
  removerItem: vi.fn(),
}))
vi.mock("../../../src/modules/pedidos/pedidos.authorization", () => ({
  autorizar: mocks.auth,
}))
vi.mock("../../../src/modules/pedidos/pedidos.service", () => mocks)
const ctx = { params: Promise.resolve({ id: "10", idItem: "20" }) }
const body = {
  idCliente: 1,
  dataEntregaPrevista: "2026-11-15",
  itens: [{ idProduto: 2, quantidade: "1.000", precoPraticado: "10.00" }],
}
function request(
  method = "GET",
  data?: unknown,
  extra: Record<string, string> = {},
  query = "",
) {
  return new Request("http://localhost/api/pedidos" + query, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "pedido-1234",
      "If-Match": '"1"',
      ...extra,
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
}
beforeEach(() => {
  mocks.auth.mockResolvedValue({ idUsuario: 1, idEmpresa: 10 })
  mocks.criarPedido.mockResolvedValue({
    idPedido: 10,
    numero: "1",
    versao: 1,
    criado: true,
  })
  mocks.listarPedidos.mockResolvedValue({
    dados: [],
    paginacao: { pagina: 1, limite: 25, totalRegistros: 0, totalPaginas: 0 },
  })
  mocks.consultarPedido.mockResolvedValue({
    idPedido: 10,
    versao: 1,
    itens: [],
  })
  for (const fn of [
    mocks.editarPedido,
    mocks.incluirItem,
    mocks.editarItem,
    mocks.removerItem,
  ])
    fn.mockResolvedValue({ idPedido: 10, versao: 2 })
})
it("POST usa permissão comercial e contexto do servidor", async () => {
  const r = await routes.criarHandler(request("POST", body))
  expect(r.status).toBe(201)
  expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request), "criar")
  expect(mocks.criarPedido).toHaveBeenCalledWith(
    { idUsuario: 1, idEmpresa: 10 },
    expect.objectContaining({ idCliente: 1 }),
    "pedido-1234",
  )
  expect(r.headers.get("Cache-Control")).toBe("private, no-store")
  expect(r.headers.get("ETag")).toBe('"1"')
})
it("repetição de criação retorna 200", async () => {
  mocks.criarPedido.mockResolvedValue({
    idPedido: 10,
    versao: 1,
    criado: false,
  })
  expect((await routes.criarHandler(request("POST", body))).status).toBe(200)
})
it("GET detalhe aguarda params e requer ler", async () => {
  const r = await routes.consultarHandler(request(), ctx)
  expect(r.status).toBe(200)
  expect(mocks.consultarPedido).toHaveBeenCalledWith(
    { idUsuario: 1, idEmpresa: 10 },
    10,
  )
  expect(mocks.auth).toHaveBeenCalledWith(expect.any(Request), "ler")
})
it("mutações usam versão esperada e permissão própria", async () => {
  expect(
    (await routes.editarHandler(request("PATCH", { observacao: "ok" }), ctx))
      .status,
  ).toBe(200)
  expect(mocks.editarPedido).toHaveBeenCalledWith(
    { idUsuario: 1, idEmpresa: 10 },
    10,
    1,
    { observacao: "ok" },
  )
  expect(
    (await routes.incluirHandler(request("POST", body.itens[0]), ctx)).status,
  ).toBe(201)
  expect(
    (
      await routes.editarItemHandler(
        request("PATCH", { quantidade: "2.000" }),
        ctx,
      )
    ).status,
  ).toBe(200)
  expect((await routes.removerHandler(request("DELETE"), ctx)).status).toBe(200)
  expect(mocks.auth).toHaveBeenLastCalledWith(expect.any(Request), "excluir")
})
it.each(["?pagina=0", "?pagina=1&pagina=2", "?id_empresa=1", "?__proto__=1"])(
  "rejeita query inválida %s",
  async (q) =>
    expect(
      (await routes.listarHandler(request("GET", undefined, {}, q))).status,
    ).toBe(400),
)
it("POST/detalhe não aceitam query", async () => {
  expect(
    (await routes.criarHandler(request("POST", body, {}, "?x=1"))).status,
  ).toBe(400)
  expect(
    (await routes.consultarHandler(request("GET", undefined, {}, "?x=1"), ctx))
      .status,
  ).toBe(400)
})
it("IDs inválidos e versão ausente não chegam à persistência", async () => {
  expect(
    (
      await routes.consultarHandler(request(), {
        params: Promise.resolve({ id: "01" }),
      })
    ).status,
  ).toBe(400)
  expect(
    (
      await routes.editarHandler(
        request("PATCH", { observacao: "ok" }, { "If-Match": "" }),
        ctx,
      )
    ).status,
  ).toBe(400)
  expect(mocks.editarPedido).not.toHaveBeenCalled()
})
it("JSON inválido, mídia errada, tamanho excedido e total enviado são 400", async () => {
  expect(
    (
      await routes.criarHandler(
        new Request("http://localhost/api/pedidos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
      )
    ).status,
  ).toBe(400)
  expect(
    (
      await routes.criarHandler(
        request("POST", body, { "Content-Type": "text/plain" }),
      )
    ).status,
  ).toBe(400)
  expect(
    (
      await routes.criarHandler(
        request("POST", { ...body, observacao: "x".repeat(66000) }),
      )
    ).status,
  ).toBe(400)
  expect(
    (await routes.criarHandler(request("POST", { ...body, total: "10.00" })))
      .status,
  ).toBe(400)
  expect(mocks.criarPedido).not.toHaveBeenCalled()
})
it("resposta da autorização mantém cache privado", async () => {
  mocks.auth.mockResolvedValue(
    Response.json({ error: "Não autenticado." }, { status: 401 }),
  )
  const r = await routes.listarHandler(request())
  expect(r.status).toBe(401)
  expect(r.headers.get("Cache-Control")).toBe("private, no-store")
})
it("erro de domínio padronizado; erro inesperado sem detalhe sensível", async () => {
  mocks.listarPedidos.mockRejectedValue(new PedidoError(409, "Conflito."))
  expect((await routes.listarHandler(request())).status).toBe(409)
  const spy = vi.spyOn(console, "error").mockImplementation(() => {})
  mocks.listarPedidos.mockRejectedValue(
    new Error("SQL senha-secreta token-secreto"),
  )
  const r = await routes.listarHandler(request())
  expect(r.status).toBe(500)
  expect(await r.json()).toEqual({ error: "Erro interno." })
  expect(spy).toHaveBeenCalledWith("Falha interna na API de pedidos.")
})

import { beforeEach, expect, it, vi } from "vitest"
import { PedidoError } from "../../../src/modules/pedidos/pedidos.error"
import {
  fecharHandler,
  consultarHandler,
} from "../../../src/modules/pedido-recebiveis/router"

const mocks = vi.hoisted(() => ({
  autorizarFechamento: vi.fn(),
  autorizarConsulta: vi.fn(),
  fecharPedido: vi.fn(),
  consultarContaReceber: vi.fn(),
}))
vi.mock(
  "../../../src/modules/pedido-recebiveis/recebiveis.authorization",
  () => mocks,
)
vi.mock(
  "../../../src/modules/pedido-recebiveis/recebiveis.service",
  () => mocks,
)

const context = { params: Promise.resolve({ id: "10" }) }
const plano = {
  idCategoriaFinanceira: 7,
  vencimentos: ["2026-11-10", "2026-12-10"],
}
const confirmado = {
  idPedido: 10,
  idFechamento: 20,
  idVenda: 30,
  versao: 2,
  fechadoEm: "2026-10-17T13:00:00.000Z",
  gerado: true,
}
const financeiro = {
  idPedido: 10,
  idFechamento: 20,
  idVenda: 30,
  total: "100.00",
  parcelas: [
    {
      numeroParcela: 1,
      valorOriginal: "50.00",
      saldo: "50.00",
      vencimento: "2026-11-10",
      situacao: "ABERTO",
    },
  ],
}
function request(
  method = "POST",
  data: unknown = plano,
  headers: Record<string, string> = {},
  query = "",
) {
  return new Request("http://localhost/api/pedidos/10/fechar" + query, {
    method,
    headers: {
      "Content-Type": "application/json",
      "If-Match": '"1"',
      ...headers,
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(data) }),
  })
}
beforeEach(() => {
  mocks.autorizarFechamento.mockResolvedValue({ idEmpresa: 10, idUsuario: 1 })
  mocks.autorizarConsulta.mockResolvedValue({ idEmpresa: 10, idUsuario: 2 })
  mocks.fecharPedido.mockResolvedValue(confirmado)
  mocks.consultarContaReceber.mockResolvedValue(financeiro)
})
it("POST usa contexto autorizado, versão forte e contrato validado", async () => {
  const req = request()
  const r = await fecharHandler(req, context)
  expect(r.status).toBe(201)
  expect(await r.json()).toEqual(confirmado)
  expect(mocks.autorizarFechamento).toHaveBeenCalledWith(req)
  expect(mocks.autorizarConsulta).not.toHaveBeenCalled()
  expect(mocks.fecharPedido).toHaveBeenCalledWith(
    { idEmpresa: 10, idUsuario: 1 },
    10,
    1,
    plano,
  )
  expect(r.headers.get("ETag")).toBe('"2"')
  expect(r.headers.get("Cache-Control")).toBe("private, no-store")
})
it("POST não expõe parcelas e valores retornados acidentalmente pelo serviço", async () => {
  mocks.fecharPedido.mockResolvedValue({
    ...confirmado,
    parcelas: financeiro.parcelas,
    total: "100.00",
    saldo: "100.00",
    observacaoFinanceira: "restrita",
  })
  expect(await (await fecharHandler(request(), context)).json()).toEqual(
    confirmado,
  )
})
it("repetição retorna 200 sem impedir no HTTP a versão original da primeira chamada", async () => {
  mocks.fecharPedido.mockResolvedValue({ ...confirmado, gerado: false })
  const r = await fecharHandler(request(), context)
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ ...confirmado, gerado: false })
  expect(mocks.fecharPedido).toHaveBeenCalledWith(
    expect.any(Object),
    10,
    1,
    plano,
  )
})
it("GET usa autorização financeira independente e devolve o DTO autorizado", async () => {
  const req = request("GET")
  const r = await consultarHandler(req, context)
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual(financeiro)
  expect(mocks.autorizarConsulta).toHaveBeenCalledWith(req)
  expect(mocks.autorizarFechamento).not.toHaveBeenCalled()
  expect(mocks.consultarContaReceber).toHaveBeenCalledWith(
    { idEmpresa: 10, idUsuario: 2 },
    10,
  )
  expect(r.headers.get("Cache-Control")).toBe("private, no-store")
})
it.each([
  null,
  "",
  "1",
  "*",
  'W/"1"',
  '"0"',
  '"01"',
  '"2147483648"',
  '"1", "2"',
])("If-Match inválido %s não chega ao serviço", async (versao) => {
  const req = request()
  if (versao === null) req.headers.delete("If-Match")
  else req.headers.set("If-Match", versao)
  expect((await fecharHandler(req, context)).status).toBe(400)
  expect(mocks.fecharPedido).not.toHaveBeenCalled()
})
it.each(["0", "01", "1.0", "-1", "2147483648", "__proto__"])(
  "ambos os endpoints rejeitam ID inválido %s",
  async (id) => {
    const ctx = { params: Promise.resolve({ id }) }
    expect((await fecharHandler(request(), ctx)).status).toBe(400)
    expect((await consultarHandler(request("GET"), ctx)).status).toBe(400)
    expect(mocks.fecharPedido).not.toHaveBeenCalled()
    expect(mocks.consultarContaReceber).not.toHaveBeenCalled()
  },
)
it.each([
  "?x=1",
  "?idEmpresa=20",
  "?idEmpresa=10&idEmpresa=20",
  "?__proto__=1",
])("nenhum endpoint recebe parâmetros de query: %s", async (query) => {
  expect(
    (await fecharHandler(request("POST", plano, {}, query), context)).status,
  ).toBe(400)
  expect(
    (await consultarHandler(request("GET", undefined, {}, query), context))
      .status,
  ).toBe(400)
  expect(mocks.fecharPedido).not.toHaveBeenCalled()
  expect(mocks.consultarContaReceber).not.toHaveBeenCalled()
})
it.each([
  {},
  { vencimentos: ["2026-11-10"] },
  { ...plano, vencimentos: [] },
  { ...plano, vencimentos: ["2026-02-29"] },
  { ...plano, total: "100.00" },
  { ...plano, saldo: "100.00" },
  { ...plano, idEmpresa: 20 },
])("rejeita plano inválido/total externo %j", async (input) => {
  expect((await fecharHandler(request("POST", input), context)).status).toBe(
    400,
  )
  expect(mocks.fecharPedido).not.toHaveBeenCalled()
})
it("preserva exatamente a ordem e datas repetidas do plano", async () => {
  const input = {
    ...plano,
    vencimentos: ["2027-01-10", "2026-01-01", "2026-01-01"],
  }
  expect((await fecharHandler(request("POST", input), context)).status).toBe(
    201,
  )
  expect(mocks.fecharPedido).toHaveBeenCalledWith(
    expect.any(Object),
    10,
    1,
    input,
  )
})
it.each(["text/plain", "application/x-www-form-urlencoded", ""])(
  "rejeita mídia incompatível %s",
  async (contentType) => {
    expect(
      (
        await fecharHandler(
          request("POST", plano, { "Content-Type": contentType }),
          context,
        )
      ).status,
    ).toBe(400)
    expect(mocks.fecharPedido).not.toHaveBeenCalled()
  },
)
it("aceita JSON com charset e maiúsculas no tipo de mídia", async () => {
  expect(
    (
      await fecharHandler(
        request("POST", plano, {
          "Content-Type": "APPLICATION/JSON; charset=utf-8",
        }),
        context,
      )
    ).status,
  ).toBe(201)
})
it.each(["{", "null", "[]", "", "\ufffd"])(
  "JSON incompatível %j retorna 400",
  async (body) => {
    const req = new Request("http://localhost/api/pedidos/10/fechar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "If-Match": '"1"' },
      body,
    })
    expect((await fecharHandler(req, context)).status).toBe(400)
    expect(mocks.fecharPedido).not.toHaveBeenCalled()
  },
)
it("POST sem corpo não chega ao serviço", async () => {
  const req = new Request("http://localhost/api/pedidos/10/fechar", {
    method: "POST",
    headers: { "Content-Type": "application/json", "If-Match": '"1"' },
  })
  expect((await fecharHandler(req, context)).status).toBe(400)
  expect(mocks.fecharPedido).not.toHaveBeenCalled()
})
it("rejeita UTF-8 inválido sem expor dados internos", async () => {
  const req = new Request("http://localhost/api/pedidos/10/fechar", {
    method: "POST",
    headers: { "Content-Type": "application/json", "If-Match": '"1"' },
    body: new Uint8Array([255]),
  })
  const r = await fecharHandler(req, context)
  expect(r.status).toBe(400)
  expect(await r.json()).toEqual({ error: "JSON inválido." })
})
it("limite é 64 KiB de bytes reais, sem confiar em Content-Length", async () => {
  const base = JSON.stringify(plano)
  const headers = {
    "Content-Type": "application/json",
    "If-Match": '"1"',
    "Content-Length": "1",
  }
  const dentro = new Request("http://localhost/api/pedidos/10/fechar", {
    method: "POST",
    headers,
    body: base + " ".repeat(65536 - base.length),
  })
  expect((await fecharHandler(dentro, context)).status).toBe(201)
  mocks.fecharPedido.mockClear()
  const excedido = new Request("http://localhost/api/pedidos/10/fechar", {
    method: "POST",
    headers,
    body: base + " ".repeat(65537 - base.length),
  })
  const r = await fecharHandler(excedido, context)
  expect(r.status).toBe(400)
  expect(await r.json()).toEqual({ error: "JSON excede 64 KiB." })
  expect(mocks.fecharPedido).not.toHaveBeenCalled()
})
it("autentica novamente inclusive em replay e antes de validar dados do corpo", async () => {
  mocks.autorizarFechamento.mockResolvedValue(
    Response.json({ error: "Não autenticado." }, { status: 401 }),
  )
  const r = await fecharHandler(request("POST", { total: "segredo" }), context)
  expect(r.status).toBe(401)
  expect(r.headers.get("Cache-Control")).toBe("private, no-store")
  expect(mocks.fecharPedido).not.toHaveBeenCalled()
})
it("nega consulta sem executar leitura financeira e mantém cache privado", async () => {
  mocks.autorizarConsulta.mockResolvedValue(
    Response.json({ error: "Acesso negado." }, { status: 403 }),
  )
  const r = await consultarHandler(request("GET"), context)
  expect(r.status).toBe(403)
  expect(r.headers.get("Cache-Control")).toBe("private, no-store")
  expect(mocks.consultarContaReceber).not.toHaveBeenCalled()
})
it.each([403, 404, 409] as const)(
  "preserva erro de domínio %s e cache seguro",
  async (status) => {
    mocks.fecharPedido.mockRejectedValue(
      new PedidoError(status, "Condição explícita."),
    )
    const r = await fecharHandler(request(), context)
    expect(r.status).toBe(status)
    expect(await r.json()).toEqual({ error: "Condição explícita." })
    expect(r.headers.get("Cache-Control")).toBe("private, no-store")
  },
)
it("falhas inesperadas não expõem SQL, tokens ou credenciais", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  mocks.consultarContaReceber.mockRejectedValue(
    new Error("SELECT senha-secreta token-secreto"),
  )
  const r = await consultarHandler(request("GET"), context)
  expect(r.status).toBe(500)
  expect(await r.json()).toEqual({ error: "Erro interno." })
  expect(r.headers.get("Cache-Control")).toBe("private, no-store")
  expect(log).toHaveBeenCalledExactlyOnceWith(
    "Falha interna na API de fechamento de pedidos.",
  )
})

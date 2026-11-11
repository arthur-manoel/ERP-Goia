import { beforeEach, expect, it, vi } from "vitest"
import { compras } from "@/modules/compras/router"
import { resetRateLimitsForTests } from "@/lib/api/rate-limit"

const { autorizar, confirmarCompra, preverPlanoCompra } = vi.hoisted(() => ({
  autorizar: vi.fn(),
  confirmarCompra: vi.fn(),
  preverPlanoCompra: vi.fn(),
}))
vi.mock("@/modules/compras/compras.authorization", () => ({
  autorizar,
  recursosDaOpcao: vi.fn(),
}))
vi.mock("@/modules/compras/compras.service", () => ({
  confirmarCompra,
  preverPlanoCompra,
}))

const ctx = { idUsuario: 2, idEmpresa: 3 }
const input = { acao: "confirmar", idCategoria: 1, vencimentos: ["2026-12-05"] }
const chamar = (body: unknown) =>
  compras.acao(
    new Request("http://localhost/api/compras/compras/4/acao", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "4" }) },
  )

beforeEach(() => {
  vi.resetAllMocks()
  resetRateLimitsForTests()
  autorizar.mockResolvedValue(ctx)
  confirmarCompra.mockResolvedValue({
    idCompra: 4,
    status: "EMITIDA",
    confirmada: true,
  })
  preverPlanoCompra.mockResolvedValue({ plano: { valorTotal: "100.00" } })
})

it.each([401, 403])(
  "bloqueia a confirmação quando a autorização retorna %s",
  async (status) => {
    autorizar.mockResolvedValue(new Response(null, { status }))
    expect((await chamar(input)).status).toBe(status)
    expect(confirmarCompra).not.toHaveBeenCalled()
  },
)

it("usa a permissão de edição de compras e repassa a empresa autenticada", async () => {
  const response = await chamar(input)
  expect(autorizar).toHaveBeenCalledWith(
    expect.any(Request),
    "compras",
    "editar",
    undefined,
  )
  expect(confirmarCompra).toHaveBeenCalledWith(ctx, 4, input)
  expect(await response.json()).toEqual({
    idCompra: 4,
    status: "EMITIDA",
    confirmada: true,
  })
})

it("a prévia não chama a confirmação e empresa extra é rejeitada", async () => {
  expect((await chamar({ ...input, acao: "prever_plano" })).status).toBe(200)
  expect(preverPlanoCompra).toHaveBeenCalledOnce()
  expect((await chamar({ ...input, idEmpresa: 100 })).status).toBe(400)
  expect(confirmarCompra).not.toHaveBeenCalled()
})

it("aplica o limite de escrita por usuário autenticado", async () => {
  for (let i = 0; i < 60; i++) expect((await chamar(input)).status).toBe(200)
  expect((await chamar(input)).status).toBe(429)
  expect(confirmarCompra).toHaveBeenCalledTimes(60)
})

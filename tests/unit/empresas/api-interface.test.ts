import { expect, it, vi } from "vitest"
import { criarApiEmpresas } from "@/features/empresas/api"
import {
  cadastroEmpresaSchema,
  formularioEmpresa,
  payloadEmpresa,
} from "@/features/empresas/schemas"

const dados = cadastroEmpresaSchema.parse(
  payloadEmpresa({
    ...formularioEmpresa(),
    razao_social: "Empresa Teste",
    cnpj: "11222333000181",
  }),
)
const empresa = { ...dados, id: 20, status: "ATIVA" }
const ok = (data: unknown) => Response.json({ success: true, data })

it("consome paginação real e repassa o sinal de cancelamento", async () => {
  const request = vi
    .fn()
    .mockResolvedValue(
      ok({ data: [empresa], page: 2, limit: 10, total: 11, totalPages: 2 }),
    )
  const signal = new AbortController().signal
  const pagina = await criarApiEmpresas(request).listar(
    { pagina: 2, limite: 10, busca: "Teste", filtros: {}, ordenacao: null },
    signal,
  )
  expect(pagina.itens[0].id).toBe(20)
  expect(request).toHaveBeenCalledExactlyOnceWith(
    "/api/empresas?page=2&limit=10&search=Teste",
    { signal },
  )
})
it("POST, PATCH parcial, inativação e reativação usam métodos e corpos corretos", async () => {
  const request = vi.fn().mockImplementation(async () => ok(empresa))
  const api = criarApiEmpresas(request)
  await api.criar(dados)
  await api.editar(20, { email: null })
  await api.inativar(20)
  await api.ativar(20)
  expect(
    request.mock.calls.map(([url, init]) => [
      url,
      init.method,
      init.body && JSON.parse(init.body),
    ]),
  ).toEqual([
    ["/api/empresas", "POST", dados],
    ["/api/empresas/20", "PATCH", { email: null }],
    ["/api/empresas/20", "DELETE", undefined],
    ["/api/empresas/20", "PATCH", { status: "ATIVA" }],
  ])
  for (const [, init] of request.mock.calls)
    expect(new Headers(init.headers).has("X-Empresa-Id")).toBe(false)
})
it.each([400, 401, 403, 404, 409, 429, 500])(
  "não repete escrita após erro HTTP %s",
  async (status) => {
    const request = vi
      .fn()
      .mockResolvedValue(
        Response.json(
          { success: false, error: "Falha controlada" },
          { status },
        ),
      )
    await expect(criarApiEmpresas(request).criar(dados)).rejects.toThrow(
      "Falha controlada",
    )
    expect(request).toHaveBeenCalledOnce()
  },
)
it("resposta 2xx inválida não simula confirmação de gravação", async () => {
  const request = vi.fn().mockResolvedValue(new Response("<html>erro</html>"))
  await expect(criarApiEmpresas(request).criar(dados)).rejects.toThrow(
    "a resposta não foi confirmada",
  )
  expect(request).toHaveBeenCalledOnce()
})
it("rejeita alteração de campos protegidos e não envia edição sem mudanças", async () => {
  const request = vi.fn(),
    api = criarApiEmpresas(request)
  await expect(api.editar(20, { id: 2 } as never)).rejects.toThrow()
  await expect(api.editar(20, { status: "INATIVA" } as never)).rejects.toThrow()
  await api.editar(20, {})
  expect(request).not.toHaveBeenCalled()
})
it("rejeita ID divergente no detalhe", async () => {
  const request = vi.fn().mockResolvedValue(ok({ ...empresa, id: 99 }))
  await expect(
    criarApiEmpresas(request).consultar(20, new AbortController().signal),
  ).rejects.toThrow("fora do cadastro")
})

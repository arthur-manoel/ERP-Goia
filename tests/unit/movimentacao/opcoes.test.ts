import { beforeEach, expect, it, vi } from "vitest"
import { autorizarEstoque } from "../../../src/modules/estoque-minimo/estoque-minimo.authorization"
import { listarOpcoesMovimentacao } from "../../../src/lib/movimentacao/opcoes"

vi.mock("server-only", () => ({}))
vi.mock(
  "../../../src/modules/estoque-minimo/estoque-minimo.authorization",
  () => ({ autorizarEstoque: vi.fn() }),
)

beforeEach(() => {
  vi.mocked(autorizarEstoque).mockResolvedValue({
    idUsuario: 1,
    idEmpresa: 10,
    podeEditar: false,
  })
})

it("retorna opções sem cache depois de autorizar leitura da empresa", async () => {
  const request = new Request(
    "http://localhost/api/estoque/movimentacoes/opcoes",
    {
      headers: {
        Authorization: "Bearer access-token",
        "X-Empresa-Id": "10",
      },
    },
  )

  const response = await listarOpcoesMovimentacao(request)

  expect(response.status).toBe(200)
  expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  const body = await response.json()
  expect(body.itens).toContainEqual(
    expect.objectContaining({ id: 1, codigo: "CAM-001" }),
  )
  expect(body.estoques).toContainEqual({
    id: 1,
    nome: "Estoque Principal",
  })
  expect(autorizarEstoque).toHaveBeenCalledWith(request, "ler")
})

it("não expõe opções quando a autenticação recusa a requisição", async () => {
  vi.mocked(autorizarEstoque).mockResolvedValue(
    Response.json({ error: "Não autenticado." }, { status: 401 }),
  )

  const response = await listarOpcoesMovimentacao(
    new Request("http://localhost/api/estoque/movimentacoes/opcoes"),
  )

  expect(response.status).toBe(401)
  expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  expect(await response.json()).toEqual({ error: "Não autenticado." })
})

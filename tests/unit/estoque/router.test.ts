import { beforeEach, expect, it, vi } from "vitest"
import { autorizarEstoque } from "../../../src/modules/estoque-minimo/estoque-minimo.authorization"
import { EstoqueError } from "../../../src/modules/estoque/estoque.error"
import * as repository from "../../../src/modules/estoque/estoque.repository"
import {
  criarVinculoEstoqueHandler,
  detalharEstoqueHandler,
  listarEstoqueHandler,
} from "../../../src/modules/estoque/router"

vi.mock("server-only", () => ({}))
vi.mock(
  "../../../src/modules/estoque-minimo/estoque-minimo.authorization",
  () => ({ autorizarEstoque: vi.fn() }),
)
vi.mock("../../../src/modules/estoque/estoque.repository", () => ({
  listarEstoque: vi.fn(),
  detalharEstoque: vi.fn(),
  criarVinculoEstoque: vi.fn(),
}))
beforeEach(() => {
  vi.mocked(autorizarEstoque).mockResolvedValue({
    idUsuario: 1,
    idEmpresa: 10,
    podeEditar: false,
  })
  vi.mocked(repository.listarEstoque).mockResolvedValue({
    dados: [],
    paginacao: { pagina: 1, limite: 25, totalRegistros: 0, totalPaginas: 0 },
  })
})
const body = { idProduto: 3, idLocalEstoque: 2, idSetor: 4 }
const post = (value: unknown = body) =>
  new Request("http://localhost/api/estoque", {
    method: "POST",
    body: JSON.stringify(value),
  })

it.each([true, false])(
  "confirma criação %s com status apropriado e permissão criar",
  async (criado) => {
    vi.mocked(repository.criarVinculoEstoque).mockResolvedValue({
      idEstoque: 100,
      ...body,
      criado,
    })
    const response = await criarVinculoEstoqueHandler(post())
    expect(response.status).toBe(criado ? 201 : 200)
    expect(await response.json()).toEqual({ idEstoque: 100, ...body, criado })
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(autorizarEstoque).toHaveBeenCalledWith(expect.any(Request), "criar")
  },
)

it("GETs exigem leitura e o detalhe usa params assíncrono", async () => {
  vi.mocked(repository.detalharEstoque).mockResolvedValue({
    idEstoque: 100,
    produto: {
      id: 3,
      codigo: "T",
      codigoInterno: null,
      nome: "Tecido",
      unidade: "M",
      status: "ATIVO",
      statusNaEmpresa: "ATIVO",
    },
    localEstoque: { id: 2, nome: "Local", status: "ATIVO" },
    setor: { id: 4, nome: "Setor", status: "ATIVO" },
    quantidadeFisica: "1.000",
    quantidadeReservada: "0.000",
    quantidadeDisponivel: "1.000",
    atualizadoEm: "2026-01-01T12:00:00.000Z",
  })
  expect(
    (await listarEstoqueHandler(new Request("http://localhost/api/estoque")))
      .status,
  ).toBe(200)
  const detalhe = await detalharEstoqueHandler(
    new Request("http://localhost/api/estoque/100"),
    { params: Promise.resolve({ id: "100" }) },
  )
  expect(detalhe.status).toBe(200)
  expect((await detalhe.json()).idEstoque).toBe(100)
  expect(repository.detalharEstoque).toHaveBeenCalledWith(10, 100)
  expect(autorizarEstoque).toHaveBeenLastCalledWith(expect.any(Request), "ler")
})

it("rejeita corpo extra e JSON inválido antes da persistência", async () => {
  expect(
    (await criarVinculoEstoqueHandler(post({ ...body, quantidade: 5 }))).status,
  ).toBe(400)
  expect(
    (
      await criarVinculoEstoqueHandler(
        new Request("http://localhost/api/estoque", {
          method: "POST",
          body: "{",
        }),
      )
    ).status,
  ).toBe(400)
  expect(repository.criarVinculoEstoque).not.toHaveBeenCalled()
})

it("rejeita filtros repetidos e ID fora do Int sem consultar posições", async () => {
  expect(
    (
      await listarEstoqueHandler(
        new Request("http://localhost/api/estoque?pagina=1&pagina=2"),
      )
    ).status,
  ).toBe(400)
  expect(
    (
      await detalharEstoqueHandler(
        new Request("http://localhost/api/estoque/2147483648"),
        { params: Promise.resolve({ id: "2147483648" }) },
      )
    ).status,
  ).toBe(400)
  expect(repository.listarEstoque).not.toHaveBeenCalled()
  expect(repository.detalharEstoque).not.toHaveBeenCalled()
})

it.each([401, 403])(
  "recusa %s mantém cache privado e não grava",
  async (status) => {
    vi.mocked(autorizarEstoque).mockResolvedValue(
      Response.json({ error: "negado" }, { status }),
    )
    const response = await criarVinculoEstoqueHandler(post())
    expect(response.status).toBe(status)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(repository.criarVinculoEstoque).not.toHaveBeenCalled()
  },
)

it("erros de negócio preservam status; erro interno não vaza no corpo nem log", async () => {
  vi.mocked(repository.criarVinculoEstoque).mockRejectedValue(
    new EstoqueError(409, "Conflito de vínculo."),
  )
  expect((await criarVinculoEstoqueHandler(post())).status).toBe(409)
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  vi.mocked(repository.criarVinculoEstoque).mockRejectedValue(
    new Error("SELECT segredo mysql://credencial token"),
  )
  const response = await criarVinculoEstoqueHandler(post())
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({
    error: "Não foi possível processar o estoque.",
  })
  expect(log).toHaveBeenCalledWith("Falha na API de posições de estoque.")
})

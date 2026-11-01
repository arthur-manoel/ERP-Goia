import { expect, it, vi } from "vitest"
import {
  alterarStatusCategoria,
  listarCategorias,
  salvarCategoria,
} from "../../../src/features/categorias/api"

const categoria = {
  id: 3,
  id_empresa: 10,
  nome: "Tecidos",
  descricao: null,
  status: "ATIVA" as const,
}
const resposta = (data: unknown, status = 200) =>
  Response.json({ success: true, data }, { status })

it("envia empresa, busca, status e página para a API sem filtrar somente a página local", async () => {
  const requisitar = vi.fn().mockResolvedValue(
    resposta({
      rows: [categoria],
      count: 21,
      page: 2,
      limit: 10,
      totalPages: 3,
    }),
  )
  const signal = new AbortController().signal
  const result = await listarCategorias(
    requisitar,
    10,
    { busca: "  Tecido  ", status: "ATIVA", pagina: 2 },
    signal,
  )
  const query = new URL(requisitar.mock.calls[0][0], "http://localhost")
    .searchParams
  expect(Object.fromEntries(query)).toEqual({
    page: "2",
    limit: "10",
    ordenar_por: "nome",
    ordem: "asc",
    busca: "Tecido",
    status: "ATIVA",
  })
  expect(requisitar.mock.calls[0][1].signal).toBe(signal)
  expect(requisitar.mock.calls[0][1].headers["X-Empresa-Id"]).toBe("10")
  expect(result.count).toBe(21)
})

it("não expõe no cliente uma resposta de outra empresa", async () => {
  const requisitar = vi.fn().mockResolvedValue(
    resposta({
      rows: [{ ...categoria, id_empresa: 20 }],
      count: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    }),
  )
  await expect(
    listarCategorias(requisitar, 10, { busca: "", status: "todas", pagina: 1 }),
  ).rejects.toThrow("outra empresa")
})

it("seleciona empresa pelo header e edita via PATCH sem transferir nem alterar status", async () => {
  const requisitar = vi.fn().mockImplementation(async () => resposta(categoria))
  const dados = { nome: "Tecidos", descricao: null }
  await salvarCategoria(requisitar, 10, dados)
  await salvarCategoria(requisitar, 10, dados, categoria)
  expect(
    requisitar.mock.calls.map(([url, init]) => [
      url,
      init.method,
      JSON.parse(init.body),
    ]),
  ).toEqual([
    ["/api/categorias", "POST", { ...dados, status: "ATIVA" }],
    ["/api/categorias/3", "PATCH", dados],
  ])
  for (const [, init] of requisitar.mock.calls)
    expect(init.headers["X-Empresa-Id"]).toBe("10")
})

it("inativa por DELETE e reativa por PATCH conforme o contrato", async () => {
  const requisitar = vi
    .fn()
    .mockResolvedValueOnce(resposta({ message: "ok", produtos_vinculados: 2 }))
    .mockResolvedValueOnce(resposta(categoria))
  await alterarStatusCategoria(requisitar, 10, categoria)
  await alterarStatusCategoria(requisitar, 10, {
    ...categoria,
    status: "INATIVA",
  })
  expect(requisitar.mock.calls[0]).toEqual([
    "/api/categorias/3",
    { method: "DELETE", headers: { "X-Empresa-Id": "10" } },
  ])
  expect(requisitar.mock.calls[1][1].method).toBe("PATCH")
  expect(JSON.parse(requisitar.mock.calls[1][1].body)).toEqual({
    status: "ATIVA",
  })
  await expect(
    alterarStatusCategoria(requisitar, 20, categoria),
  ).rejects.toThrow("empresa selecionada")
  expect(requisitar).toHaveBeenCalledTimes(2)
})

it("propaga erro de duplicidade para o formulário sem tratar como sucesso", async () => {
  const requisitar = vi
    .fn()
    .mockResolvedValue(
      Response.json(
        { success: false, error: "Nome duplicado." },
        { status: 409 },
      ),
    )
  await expect(
    salvarCategoria(requisitar, 10, { nome: "Tecidos", descricao: null }),
  ).rejects.toThrow("Nome duplicado.")
})

it("compartilha a normalização e os limites do schema da API", async () => {
  const requisitar = vi.fn().mockImplementation(async () => resposta(categoria))
  await salvarCategoria(requisitar, 10, {
    nome: "  Tecido\u0301s   leves  ",
    descricao: "  ",
  })
  expect(JSON.parse(requisitar.mock.calls[0][1].body)).toEqual({
    nome: "Tecidós leves",
    descricao: "",
    status: "ATIVA",
  })
  await expect(
    salvarCategoria(requisitar, 10, { nome: "A", descricao: null }),
  ).rejects.toThrow()
  await expect(
    listarCategorias(requisitar, 10, {
      busca: "a".repeat(101),
      status: "todas",
      pagina: 1,
    }),
  ).rejects.toThrow()
  expect(requisitar).toHaveBeenCalledTimes(1)
})

it.each([401, 403, 404, 409, 429, 500])(
  "preserva a mensagem HTTP %s e não confirma a operação",
  async (status) => {
    const requisitar = vi
      .fn()
      .mockResolvedValue(
        Response.json({ success: false, error: `Erro ${status}` }, { status }),
      )
    await expect(
      alterarStatusCategoria(requisitar, 10, categoria),
    ).rejects.toThrow(`Erro ${status}`)
  },
)

it("rejeita edição de outra empresa antes de enviar a requisição", async () => {
  const requisitar = vi.fn()
  await expect(
    salvarCategoria(
      requisitar,
      20,
      { nome: "Tecidos", descricao: null },
      categoria,
    ),
  ).rejects.toThrow("empresa selecionada")
  expect(requisitar).not.toHaveBeenCalled()
})

it.each([
  { ...categoria, id: 4 },
  { ...categoria, id_empresa: 20 },
])("rejeita resposta de edição com ID ou empresa divergente", async (data) => {
  const requisitar = vi.fn().mockResolvedValue(resposta(data))
  await expect(
    salvarCategoria(
      requisitar,
      10,
      { nome: "Tecidos", descricao: null },
      categoria,
    ),
  ).rejects.toThrow("Resposta de categorias inválida")
})

it("não trata envelope inválido, JSON inválido ou reativação incompleta como sucesso", async () => {
  const requisitar = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ rows: [] }))
    .mockResolvedValueOnce(new Response("invalido", { status: 200 }))
    .mockResolvedValueOnce(resposta({ ...categoria, status: "INATIVA" }))
  for (let i = 0; i < 3; i++) {
    await expect(
      alterarStatusCategoria(requisitar, 10, {
        ...categoria,
        status: "INATIVA",
      }),
    ).rejects.toThrow("Resposta de categorias inválida")
  }
})

it("rejeita metadados de paginação incoerentes sem exibir contagem falsa", async () => {
  const requisitar = vi.fn().mockResolvedValue(
    resposta({
      rows: [categoria],
      count: 21,
      page: 1,
      limit: 10,
      totalPages: 1,
    }),
  )
  await expect(
    listarCategorias(requisitar, 10, { busca: "", status: "todas", pagina: 1 }),
  ).rejects.toThrow("paginação inválida")
})

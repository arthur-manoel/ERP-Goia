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
    id_empresa: "10",
    page: "2",
    limit: "10",
    ordenar_por: "nome",
    ordem: "asc",
    busca: "Tecido",
    status: "ATIVA",
  })
  expect(requisitar.mock.calls[0][1].signal).toBe(signal)
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

it("cria com empresa explícita e edita via PATCH sem transferir a categoria", async () => {
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
    ["/api/categorias", "POST", { ...dados, id_empresa: 10 }],
    ["/api/categorias/3", "PATCH", dados],
  ])
})

it("inativa por DELETE e reativa por PATCH conforme o contrato", async () => {
  const requisitar = vi
    .fn()
    .mockImplementation(async () => resposta({ message: "ok" }))
  await alterarStatusCategoria(requisitar, 10, categoria)
  await alterarStatusCategoria(requisitar, 10, {
    ...categoria,
    status: "INATIVA",
  })
  expect(requisitar.mock.calls[0]).toEqual([
    "/api/categorias/3",
    { method: "DELETE" },
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

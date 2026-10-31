import { beforeEach, expect, it, vi } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import {
  base,
  formDays,
  inactivate,
  list,
  listUrl,
  save,
  stateOfPage,
  type Row,
} from "@/features/empresa-fornecedor/api"

const row: Row = {
  fornecedor: {
    id: 50,
    id_empresa: null,
    razao_social: "Fornecedor",
    nome_fantasia: null,
    cnpj: "12345678000190",
    status: "ATIVO",
  },
  associacao: {
    id: 5,
    prazo_pagamento: 30,
    prazo_entrega: 5,
    observacao: "Manhã",
    status: "ATIVO",
  },
}
const fixture = vi.hoisted(() => ({
  state: {
    carregando: false,
    erro: null as string | null,
    dados: {
      rows: [] as unknown[],
      count: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    },
  },
  auth: {
    estado: "autenticado",
    empresa: { id: 10, nome: "Empresa" },
    empresas: [{ id: 10, nome: "Empresa" }],
    selecionarEmpresa: () => {},
    requisitar: vi.fn(),
  },
}))
vi.mock("@/features/autenticacao/provedor-autenticacao", () => ({
  useAutenticacao: () => fixture.auth,
  mensagemErro: async (r: Response) => (await r.json()).error,
}))
vi.mock("@/features/clientes/use-consulta", () => ({
  useConsultaCliente: () => fixture.state,
}))
import { TelaEmpresaFornecedor } from "@/features/empresa-fornecedor/components/tela-empresa-fornecedor"
beforeEach(() => {
  fixture.state.carregando = false
  fixture.state.erro = null
  fixture.state.dados = {
    rows: [],
    count: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
  }
})
it("paginação/filtros são enviados ao backend sem empresa no corpo ou URL", () => {
  expect(listUrl("ASSOCIADOS", " Tecidos ", "ATIVO", 2)).toBe(
    `${base}?page=2&limit=10&busca=Tecidos&status=ATIVO`,
  )
  expect(listUrl("GLOBAL_DISPONIVEL", "", "", 1)).toContain(
    "tipo=GLOBAL_DISPONIVEL",
  )
})
it("conversão do formulário diferencia nulo, zero e dias", () => {
  expect(formDays("")).toBeNull()
  expect(formDays("0")).toBe(0)
  expect(formDays("15")).toBe(15)
  expect(() => formDays("-1")).toThrow()
  expect(() => formDays("1.5")).toThrow()
})
it("cliente carrega só a página solicitada e encaminha AbortSignal", async () => {
  const requisitar = vi.fn().mockResolvedValue(
    Response.json({
      success: true,
      data: {
        rows: [
          {
            ...row.associacao,
            id_empresa: 10,
            id_fornecedor: 50,
            fornecedores: row.fornecedor,
          },
        ],
        count: 31,
        page: 2,
        limit: 10,
        totalPages: 4,
      },
    }),
  )
  const signal = new AbortController().signal
  const result = await list(
    requisitar,
    `${base}?page=2&limit=10`,
    "ASSOCIADOS",
    signal,
  )
  expect(requisitar).toHaveBeenCalledOnce()
  expect(requisitar.mock.calls[0][1]).toEqual({ signal })
  expect(result).toMatchObject({ count: 31, page: 2, rows: [row] })
})
it("atualização e inativação utilizam os endpoints corretos e preservam campos omitidos", async () => {
  const result = {
    ...row.associacao,
    id_empresa: 10,
    id_fornecedor: 50,
    fornecedores: row.fornecedor,
  }
  const requisitar = vi
    .fn()
    .mockImplementation(async () =>
      Response.json({ success: true, data: result }),
    )
  await save(requisitar, row, { observacao: null }, true)
  expect(requisitar).toHaveBeenCalledWith(
    `${base}/5`,
    expect.objectContaining({ method: "PATCH", body: '{"observacao":null}' }),
  )
  await inactivate(requisitar, 5)
  expect(requisitar).toHaveBeenLastCalledWith(`${base}/5`, { method: "DELETE" })
})
it("estados de carregamento, erro, vazio e lista têm precedência definida", () => {
  expect(stateOfPage(true, null, 0)).toBe("loading")
  expect(stateOfPage(false, "erro", 0)).toBe("error")
  expect(stateOfPage(false, null, 0)).toBe("empty")
  expect(stateOfPage(false, null, 1)).toBe("ready")
})
it("renderiza estado de carregamento sem dados antigos", () => {
  fixture.state.carregando = true
  expect(renderToStaticMarkup(createElement(TelaEmpresaFornecedor))).toContain(
    "Carregando condições de fornecedores",
  )
})
it("renderiza lista vazia e orientação para associação", () => {
  const html = renderToStaticMarkup(createElement(TelaEmpresaFornecedor))
  expect(html).toContain("Nenhum fornecedor encontrado")
  expect(html).toContain("Globais disponíveis")
})
it("renderiza falha com tentativa de recarregamento", () => {
  fixture.state.erro = "Sem permissão"
  const html = renderToStaticMarkup(createElement(TelaEmpresaFornecedor))
  expect(html).toContain("Sem permissão")
  expect(html).toContain("Tentar novamente")
})

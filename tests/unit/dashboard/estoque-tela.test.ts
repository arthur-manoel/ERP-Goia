import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, expect, it, vi } from "vitest"
import { InsumosAbaixoDoMinimo } from "@/components/dashboard/insumos-abaixo-do-minimo"
import { AlertaEstoqueMinimo } from "@/components/dashboard/alerta-estoque-minimo"
import { useIndicadorEstoque } from "@/components/dashboard/provedor-indicador-estoque"
vi.mock("@/components/dashboard/provedor-indicador-estoque", () => ({
  useIndicadorEstoque: vi.fn(),
}))
const estoque = vi.mocked(useIndicadorEstoque)
beforeEach(() =>
  estoque.mockReturnValue({
    estado: "autenticado",
    empresas: [{ id: 1, nome: "A" }],
    empresa: { id: 1, nome: "A" },
    dados: null,
    falha: false,
    semPermissao: false,
  }),
)
it("oculta o estoque negado sem mostrar erro ou carregamento", () => {
  estoque.mockReturnValue({ ...estoque(), semPermissao: true })
  expect(renderToStaticMarkup(createElement(InsumosAbaixoDoMinimo))).toBe("")
  expect(renderToStaticMarkup(createElement(AlertaEstoqueMinimo))).toBe("")
})
it("mantém erros técnicos visíveis quando a consulta realmente falha", () => {
  estoque.mockReturnValue({ ...estoque(), falha: true })
  expect(renderToStaticMarkup(createElement(InsumosAbaixoDoMinimo))).toContain(
    "Não foi possível carregar",
  )
})
it("mostra carregamento enquanto aguarda o estoque da empresa atual", () => {
  expect(renderToStaticMarkup(createElement(InsumosAbaixoDoMinimo))).toContain(
    "Carregando indicador",
  )
  expect(renderToStaticMarkup(createElement(AlertaEstoqueMinimo))).toBe("")
})

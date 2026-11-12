import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"
import { SituacaoPedidos } from "../../../src/components/vendas/situacao-pedidos"
const contexto = vi.hoisted(() => ({
  estado: "autenticado",
  empresa: null,
  usuario: { email: "teste@example.test" },
  empresas: [
    { id: 10, nome: "Empresa A" },
    { id: 20, nome: "Empresa B" },
  ],
  selecionarEmpresa: vi.fn(),
}))
vi.mock("../../../src/features/autenticacao/provedor-autenticacao", () => ({
  useAutenticacao: () => contexto,
}))
vi.mock("../../../src/features/erp/components/seletor-pesquisavel", () => ({
  SearchSelect: (props: {
    value: string
    options: { value: string; label: string }[]
    onValueChange: (v: string) => void
  }) => {
    seletor(props)
    return createElement(
      "select",
      { "aria-label": "Empresa ativa", defaultValue: props.value },
      props.options.map((o) =>
        createElement("option", { key: o.value, value: o.value }, o.label),
      ),
    )
  },
}))
const seletor = vi.fn()
it("oferece empresas antes de exigir uma seleção e conecta a escolha ao provedor", () => {
  const html = renderToStaticMarkup(createElement(SituacaoPedidos))
  expect(html).toContain('aria-label="Empresa ativa"')
  expect(html).toContain("Empresa A")
  expect(html).toContain("Empresa B")
  expect(html).toContain("selecione uma empresa")
  const props = seletor.mock.calls[0][0]
  expect(props.value).toBe("")
  props.onValueChange("20")
  expect(contexto.selecionarEmpresa).toHaveBeenCalledWith(20)
})

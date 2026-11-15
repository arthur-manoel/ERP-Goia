import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, expect, it, vi } from "vitest"
import { ProvedorIndicadores } from "@/components/dashboard/provedor-indicadores"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
vi.mock("@/features/autenticacao/provedor-autenticacao", () => ({
  useAutenticacao: vi.fn(),
}))
vi.mock("@/features/autenticacao/seletor-empresa", () => ({
  SeletorEmpresa: () => createElement("label", null, "Empresa ativa"),
}))
const autenticacao = vi.mocked(useAutenticacao)
beforeEach(() =>
  autenticacao.mockReturnValue({
    estado: "autenticado",
    usuario: { email: "a@a.test", nome: "A" },
    empresas: [
      { id: 1, nome: "A" },
      { id: 2, nome: "B" },
    ],
    empresa: null,
    requisitar: vi.fn(),
    selecionarEmpresa: vi.fn(),
    entrar: vi.fn(),
    sair: vi.fn(),
  }),
)
const render = () =>
  renderToStaticMarkup(
    createElement(
      ProvedorIndicadores,
      null,
      createElement("span", null, "Indicadores"),
    ),
  )
it("oferece seleção de empresa e não deixa indicadores carregando sem empresa", () => {
  const html = render()
  expect(html).toContain("Empresa ativa")
  expect(html).toContain("Selecione uma empresa")
  expect(html).not.toContain("Indicadores")
})
it("monta indicadores somente com empresa ativa", () => {
  autenticacao.mockReturnValue({
    ...autenticacao(),
    empresa: { id: 1, nome: "A" },
  })
  expect(render()).toContain("Indicadores")
})
it("não mantém indicadores ao sair da sessão", () => {
  autenticacao.mockReturnValue({
    ...autenticacao(),
    estado: "anonimo",
    usuario: null,
  })
  const html = render()
  expect(html).toContain("/login")
  expect(html).not.toContain("Indicadores")
})

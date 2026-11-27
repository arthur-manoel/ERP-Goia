import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, it, vi } from "vitest"
import { PedidosAEntregar } from "@/components/dashboard/pedidos-a-entregar"
import { useIndicador } from "@/components/dashboard/provedor-indicadores"
import { carregarIndicadores } from "@/components/dashboard/carregar-indicadores"
vi.mock("@/components/dashboard/provedor-indicadores", () => ({
  useIndicador: vi.fn(),
}))

it("mostra falha de consulta em vez de quebrar a tela com dados de pedidos vazios", async () => {
  let resultado
  const cancelar = carregarIndicadores(
    async (url) =>
      url.endsWith("pedidos")
        ? Response.json({ data: { estado: "ok", dados: {} } })
        : new Response(null, { status: 403 }),
    (dados) => {
      if (dados.pedidos) resultado = dados.pedidos
    },
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
  vi.mocked(useIndicador).mockReturnValue(resultado)
  expect(() =>
    renderToStaticMarkup(createElement(PedidosAEntregar)),
  ).not.toThrow()
  expect(renderToStaticMarkup(createElement(PedidosAEntregar))).toContain(
    "Não foi possível carregar",
  )
  cancelar()
})

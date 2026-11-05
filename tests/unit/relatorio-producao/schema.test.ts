import { expect, it } from "vitest"
import { validarFiltrosRelatorioProducao } from "../../../src/modules/relatorio-producao/relatorio-producao.schema"

it("aceita período válido e aplica a paginação padrão", () => {
  expect(
    validarFiltrosRelatorioProducao(
      new URLSearchParams("data_inicial=2026-01-01&data_final=2026-01-31"),
    ),
  ).toEqual({
    data_inicial: "2026-01-01",
    data_final: "2026-01-31",
    pagina: 1,
    limite: 20,
  })
})

it.each([
  "",
  "data_inicial=2026-01-31&data_final=2026-01-01",
  "data_inicial=2026-1-01&data_final=2026-01-31",
  "data_inicial=2026-02-29&data_final=2026-03-01",
  "data_inicial=2026-01-01&data_final=2026-01-31&pagina=0",
  "data_inicial=2026-01-01&data_final=2026-01-31&limite=101",
  "data_inicial=2026-01-01&data_final=2026-01-31&pagina=1&pagina=2",
  "data_inicial=2026-01-01&data_final=2026-01-31&id_empresa=2",
])("rejeita filtros inválidos: %s", (query) =>
  expect(
    validarFiltrosRelatorioProducao(new URLSearchParams(query)),
  ).toBeNull(),
)

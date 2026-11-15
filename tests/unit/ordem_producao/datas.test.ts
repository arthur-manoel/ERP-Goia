import { expect, it } from "vitest"
import { previsaoAnteriorAoDiaDeInicio } from "../../../src/modules/producao/producao.datas"

it.each([
  ["2026-11-14T00:00:00.000Z", "2026-11-14T23:59:59.999Z", false],
  ["2026-11-14T00:00:00.000Z", "2026-11-15T00:00:00.000Z", true],
  ["2026-11-15T00:00:00.000Z", "2026-11-14T15:00:00.000Z", false],
  ["2026-11-14T00:00:00.000Z", "2026-11-14T20:00:00-03:00", false],
])(
  "compara os dias UTC de previsão %s e início %s",
  (previsao, inicio, esperado) => {
    expect(
      previsaoAnteriorAoDiaDeInicio(new Date(previsao), new Date(inicio)),
    ).toBe(esperado)
  },
)
it("não exige previsão ou início onde os campos são opcionais", () => {
  expect(previsaoAnteriorAoDiaDeInicio(null, new Date())).toBe(false)
  expect(previsaoAnteriorAoDiaDeInicio(new Date(), null)).toBe(false)
})

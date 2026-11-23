import { expect, it } from "vitest"
import {
  envioLote,
  recebimentoLote,
} from "../../../src/modules/producao/lotes.schema"
const base = {
  idEtapaOrigem: 1,
  idEtapaDestino: 2,
  itens: [{ idItem: 3, quantidade: "0.001" }],
}
it("preserva três casas e identidade por item, permitindo produtos repetidos em linhas distintas", () => {
  expect(
    envioLote.parse({
      ...base,
      itens: [...base.itens, { idItem: 4, quantidade: "100.125" }],
    }).itens,
  ).toHaveLength(2)
})
it.each(["0", "-1", "1.0001", "1e2", "NaN", "1000000000000.000"])(
  "recusa quantidade não representável: %s",
  (quantidade) => {
    expect(
      envioLote.safeParse({ ...base, itens: [{ idItem: 3, quantidade }] })
        .success,
    ).toBe(false)
  },
)
it("recusa item repetido, campos protegidos e recebimento vazio", () => {
  expect(
    envioLote.safeParse({ ...base, itens: [...base.itens, ...base.itens] })
      .success,
  ).toBe(false)
  expect(envioLote.safeParse({ ...base, idEmpresa: 99 }).success).toBe(false)
  expect(recebimentoLote.safeParse({ itens: [] }).success).toBe(false)
  expect(
    recebimentoLote.safeParse({ itens: base.itens, idUsuario: 99 }).success,
  ).toBe(false)
})

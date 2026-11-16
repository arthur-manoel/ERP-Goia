import { expect, it } from "vitest"
import { fluxoProducaoSchema } from "../../../src/features/fluxo-producao/schemas"
import { fluxoSchema } from "../../../src/modules/fluxos/fluxos.schema"

it.each([
  ["", [1]],
  ["A", [1]],
  ["A".repeat(100), [1]],
  ["A".repeat(101), [1]],
  ["Fluxo", []],
  ["Fluxo", Array.from({ length: 100 }, (_, indice) => indice + 1)],
  ["Fluxo", Array.from({ length: 101 }, (_, indice) => indice + 1)],
  ["Fluxo", [1, 1]],
] as const)(
  "formulário e API concordam nos limites do nome e da sequência (%s)",
  (nome, setores) => {
    const interfaceValida = fluxoProducaoSchema.safeParse({
      name: nome,
      status: "Ativo",
      steps: setores.map((id) => ({ sectorId: String(id) })),
    }).success
    const apiValida = fluxoSchema.safeParse({
      nome,
      ativo: true,
      setores,
    }).success
    expect(interfaceValida).toBe(apiValida)
  },
)

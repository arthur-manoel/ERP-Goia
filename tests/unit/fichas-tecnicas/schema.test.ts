import { expect, it } from "vitest"
import { salvarFichaSchema } from "../../../modules/fichas-tecnicas/schema"

const dados = {
  id_produto: 12,
  id_ficha_esperada: null,
  itens: [{ id_produto_componente: 7, quantidade: "2.000" }],
}
it.each([
  "0",
  "0.000",
  "-1",
  "1.0001",
  "1000000000000",
  "1e3",
  "NaN",
  "foo",
  "",
  "0x1",
  "1,5",
])("rejeita quantidade %s sem lançar exceção do parser", (quantidade) => {
  expect(
    salvarFichaSchema.safeParse({
      ...dados,
      itens: [{ id_produto_componente: 7, quantidade }],
    }).success,
  ).toBe(false)
})
it.each(["0.001", "999999999999.999", "2", "2.0", "0.350"])(
  "aceita quantidade exata %s",
  (quantidade) => {
    expect(
      salvarFichaSchema.safeParse({
        ...dados,
        itens: [{ id_produto_componente: 7, quantidade }],
      }).success,
    ).toBe(true)
  },
)
it.each([
  { ...dados, itens: [] },
  { ...dados, itens: [...dados.itens, ...dados.itens] },
  { ...dados, itens: [{ id_produto_componente: 12, quantidade: "1" }] },
  { ...dados, id_empresa: 20 },
  { ...dados, id_ficha_esperada: undefined },
])("rejeita composição inválida ou campos extras", (input) =>
  expect(salvarFichaSchema.safeParse(input).success).toBe(false),
)

import { expect, it } from "vitest"
import { validarFiltros } from "../../../src/modules/relatorio-estoque/relatorio-estoque.schema"

it("normaliza padrões, booleanos e busca vazia sem perder limites", () => {
  expect(validarFiltros(new URLSearchParams("busca=++"))).toEqual({
    busca: undefined,
    incluir_zerados: true,
    pagina: 1,
    limite: 25,
    ordenar_por: "local",
    direcao: "asc",
  })
  expect(
    validarFiltros(
      new URLSearchParams(
        "incluir_zerados=false&busca=+tecido+&limite=100&pagina=2147483647",
      ),
    ),
  ).toMatchObject({
    incluir_zerados: false,
    busca: "tecido",
    limite: 100,
    pagina: 2147483647,
  })
})

it.each([
  "pagina=0",
  "pagina=-1",
  "pagina=1.5",
  "pagina=1e2",
  "pagina=2147483648",
  "limite=101",
  "limite=0",
  "limite=",
  "incluir_zerados=1",
  "incluir_zerados=False",
  "id_produto=-1",
  "id_produto=1.1",
  "id_local_estoque=abc",
  "id_local_estoque=2147483648",
  "ordenar_por=sql",
  "direcao=ASC",
  "pagina=1&pagina=2",
  "id_empresa=1",
  "desconhecido=x",
  `busca=${"a".repeat(101)}`,
])("rejeita filtro %s", (query) =>
  expect(validarFiltros(new URLSearchParams(query))).toBeNull(),
)

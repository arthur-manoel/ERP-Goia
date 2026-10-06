import { expect, it } from "vitest"
import {
  criarVinculoSchema,
  filtrosEstoqueSchema,
  idEstoqueSchema,
  validarFiltros,
} from "../../../src/modules/estoque/estoque.schema"

it("adota padrões explícitos, trim e booleanos sem coerção", () => {
  expect(filtrosEstoqueSchema.parse({})).toEqual({
    incluir_zerados: true,
    pagina: 1,
    limite: 25,
  })
  expect(
    filtrosEstoqueSchema.parse({ busca: "  ", incluir_zerados: "false" }),
  ).toMatchObject({ busca: undefined, incluir_zerados: false })
  expect(
    filtrosEstoqueSchema.parse({
      busca: " Tecido ",
      id_produto: "2147483647",
      limite: "100",
    }),
  ).toMatchObject({ busca: "Tecido", id_produto: 2147483647, limite: 100 })
})

it.each([
  "0",
  "-1",
  "1.5",
  "1e2",
  "+1",
  "01",
  "2147483648",
  "999999999999",
  "1 OR 1=1",
  "",
  " 1",
])("rejeita ID/página inválido %s", (valor) => {
  for (const campo of ["id_produto", "id_local_estoque", "id_setor", "pagina"])
    expect(filtrosEstoqueSchema.safeParse({ [campo]: valor }).success).toBe(
      false,
    )
  expect(idEstoqueSchema.safeParse(valor).success).toBe(false)
})

it.each([
  { limite: "101" },
  { incluir_zerados: "0" },
  { incluir_zerados: "FALSE" },
  { pagina: 1 },
  { busca: "a".repeat(101) },
  { id_empresa: "1" },
  { ordenar_por: "quantidade" },
])("rejeita filtro fora do contrato %j", (input) => {
  expect(filtrosEstoqueSchema.safeParse(input).success).toBe(false)
})

it("rejeita parâmetros repetidos e aceita busca literal maliciosa sem SQL", () => {
  expect(
    validarFiltros(new URLSearchParams("id_produto=1&id_produto=1")),
  ).toBeNull()
  expect(validarFiltros(new URLSearchParams("busca=x&busca=y"))).toBeNull()
  expect(
    validarFiltros(new URLSearchParams({ busca: "' OR 1=1 -- %_" }))?.busca,
  ).toBe("' OR 1=1 -- %_")
})

const body = { idProduto: 1, idLocalEstoque: 2, idSetor: 3 }
it("POST aceita apenas os três IDs numéricos", () => {
  expect(criarVinculoSchema.parse(body)).toEqual(body)
})
it.each([
  "id_empresa",
  "idEmpresa",
  "quantidade",
  "quantidadeFisica",
  "quantidade_reservada",
  "quantidadeReservada",
  "estoqueMinimo",
  "idUsuario",
])("rejeita campo proibido %s", (campo) => {
  expect(criarVinculoSchema.safeParse({ ...body, [campo]: 1 }).success).toBe(
    false,
  )
})
it.each([undefined, "1", 0, -1, 1.5, 2147483648, null, true])(
  "rejeita IDs não estritos %s",
  (valor) => {
    for (const campo of Object.keys(body))
      expect(
        criarVinculoSchema.safeParse({ ...body, [campo]: valor }).success,
      ).toBe(false)
  },
)

import { expect, it } from "vitest"
import { retornoSeguro } from "../../../src/features/autenticacao/retorno"

it.each([
  "/estoque",
  "/producao/ordens?status=aberta#lista",
  "/vendas/pedidos/situacao",
])("mantém retorno interno %s", (retorno) => {
  expect(retornoSeguro(retorno)).toBe(retorno)
})

it.each([
  undefined,
  "https://example.org",
  "//example.org",
  "/\\example.org",
  "/%5Cexample.org",
  "/%2Fexample.org",
  "/..//example.org",
  "/foo/..//example.org",
  "/%2e%2e//example.org",
  "/\n/example.org",
  "/login",
  "/login?retorno=/estoque",
  "/LOGIN/recuperar",
])("descarta retorno externo ou inválido %s", (retorno) => {
  expect(retornoSeguro(retorno)).toBe("/")
})

it("usa somente o primeiro valor quando a query repete retorno", () => {
  expect(retornoSeguro(["/estoque", "//example.org"])).toBe("/estoque")
})

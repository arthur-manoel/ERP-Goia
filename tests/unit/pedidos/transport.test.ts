import { expect, it } from "vitest"
import {
  searchParamsToUrlQuery,
  urlQueryToSearchParams,
} from "next/dist/shared/lib/router/utils/querystring"
import { listarSchema } from "../../../src/modules/pedidos/pedidos.schema"
it("documenta que o transporte instalado remove __proto__ antes do handler", () => {
  const recebido = urlQueryToSearchParams(
    searchParamsToUrlQuery(new URLSearchParams("__proto__=1")),
  )
  expect(recebido.toString()).toBe("")
  expect(listarSchema.parse(Object.fromEntries(recebido))).toEqual({
    pagina: 1,
    limite: 25,
  })
})
it.each(["constructor", "prototype"])(
  "chave desconhecida recebida %s continua inválida",
  (key) => {
    const recebido = urlQueryToSearchParams(
      searchParamsToUrlQuery(new URLSearchParams(`${key}=1`)),
    )
    expect(listarSchema.safeParse(Object.fromEntries(recebido)).success).toBe(
      false,
    )
  },
)
it("transportar filtros válidos não muda seu conteúdo nem aceita empresa", () => {
  const recebido = urlQueryToSearchParams(
    searchParamsToUrlQuery(new URLSearchParams("pagina=2&limite=10")),
  )
  expect(listarSchema.parse(Object.fromEntries(recebido))).toEqual({
    pagina: 2,
    limite: 10,
  })
  expect(listarSchema.safeParse({ id_empresa: "1" }).success).toBe(false)
})

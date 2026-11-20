import { expect, it } from "vitest"
import {
  criarVendaSchema,
  editarVendaSchema,
} from "../../../src/modules/vendas/vendas.schema"

const base = {
  idCliente: null,
  idPedido: null,
  desconto: 0,
  frete: 1.5,
  itens: [
    {
      idProduto: 7,
      idVariacao: null,
      quantidade: 1,
      valorUnitario: 12.345,
    },
  ],
}

it("aceita venda avulsa e normaliza valores para a precisão das colunas", () => {
  expect(criarVendaSchema.parse(base)).toEqual({
    ...base,
    acrescimo: "0.00",
    desconto: "0.00",
    frete: "1.50",
    itens: [
      {
        idProduto: 7,
        idVariacao: null,
        quantidade: "1.000",
        valorUnitario: "12.35",
      },
    ],
  })
})

it("rejeita produto repetido e valores fora dos limites", () => {
  expect(
    criarVendaSchema.safeParse({
      ...base,
      itens: [...base.itens, ...base.itens],
    }).success,
  ).toBe(false)
  expect(
    criarVendaSchema.safeParse({
      ...base,
      itens: [base.itens[0], { ...base.itens[0], idVariacao: 9 }],
    }).success,
  ).toBe(true)
  expect(criarVendaSchema.safeParse({ ...base, desconto: -1 }).success).toBe(
    false,
  )
  expect(
    criarVendaSchema.safeParse({
      ...base,
      itens: [{ ...base.itens[0], quantidade: 0 }],
    }).success,
  ).toBe(false)
})

it("aceita somente estados reais do ciclo de venda", () => {
  expect(editarVendaSchema.safeParse({ status: "CONFIRMADA" }).success).toBe(
    true,
  )
  expect(editarVendaSchema.safeParse({ status: "CONCLUIDA" }).success).toBe(
    false,
  )
})

import { expect, it } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { calcularValorLinha } from "@/modules/compras/notas.entrada"
import {
  conferenciaNotaSchema,
  processarNotaSchema,
} from "@/modules/compras/notas.schema"
import { recebidosPorItem } from "@/modules/compras/compras.recebimento"
it("calcula UNITARIO/METRO exatamente e arredonda cada linha comercialmente", () => {
  expect(calcularValorLinha("1.125", "10.00", "UNITARIO").toFixed(2)).toBe(
    "11.25",
  )
  expect(calcularValorLinha("0.333", "0.05", "METRO").toFixed(2)).toBe("0.02")
  expect(calcularValorLinha("6", "60.00", "TOTAL").toFixed(2)).toBe("60.00")
})
it("rejeita total calculado acima da capacidade sem arredondar a entrada", () => {
  expect(() =>
    calcularValorLinha("999999999999.999", "9999999999999.99", "UNITARIO"),
  ).toThrow()
})
const linha = {
  numeroItem: 1,
  quantidade: "6",
  unidade: "UN",
  tipoValor: "UNITARIO",
  valorUnitario: "10.00",
  valorTotal: "60.00",
}
it("aceita conferência incompleta, mas mantém números de linha únicos", () => {
  expect(
    conferenciaNotaSchema.safeParse({ versaoEsperada: 1, itens: [linha] })
      .success,
  ).toBe(true)
  expect(
    conferenciaNotaSchema.safeParse({ versaoEsperada: 1, itens: [] }).success,
  ).toBe(true)
  expect(
    conferenciaNotaSchema.safeParse({
      versaoEsperada: 1,
      itens: [linha, linha],
    }).success,
  ).toBe(false)
})
it.each(["0", "-1", "0.0001", "1e3"])(
  "recusa quantidade fiscal inválida %s",
  (quantidade) => {
    expect(
      conferenciaNotaSchema.safeParse({
        versaoEsperada: 1,
        itens: [{ ...linha, quantidade }],
      }).success,
    ).toBe(false)
  },
)
it("processamento exige versão e identidade estável das linhas", () => {
  expect(
    processarNotaSchema.safeParse({
      linhas: [{ idItem: 1, novaQuantidade: "6" }],
    }).success,
  ).toBe(false)
  expect(
    processarNotaSchema.safeParse({
      versaoEsperada: 1,
      linhas: [
        {
          idItem: 1,
          novaQuantidade: "0",
          recebimentos: [{ idMovimentacao: 5, quantidade: "6" }],
        },
      ],
    }).success,
  ).toBe(true)
})
it("não multiplica recebimentos de variações distintas do mesmo produto", () => {
  const itens = [
    { id: 1, id_produto: 7, id_cor: 2, id_tamanho: null },
    { id: 2, id_produto: 7, id_cor: 3, id_tamanho: null },
  ]
  const m = [
    {
      id_produto: 7,
      quantidade: new Prisma.Decimal(6),
      compra_recebimento_linha: { id_compra_item: 1 },
    },
    {
      id_produto: 7,
      quantidade: new Prisma.Decimal(4),
      compra_recebimento_linha: { id_compra_item: 2 },
    },
  ]
  expect([...recebidosPorItem(itens, m)]).toEqual([
    [1, "6.000"],
    [2, "4.000"],
  ])
  expect([
    ...recebidosPorItem(itens, [
      { id_produto: 7, quantidade: new Prisma.Decimal(10) },
    ]),
  ]).toEqual([])
})

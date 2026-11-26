import { describe, expect, it } from "vitest"
import {
  montarParcelas,
  resumirParcelas,
  type ParcelaLegada,
  type TituloReceber,
} from "../../../src/modules/vendas/vendas.faturamento.regras"

const titulo = (
  numero: number,
  valor: string,
  pagos: string[],
  situacao: TituloReceber["situacao"] = "ABERTO",
): TituloReceber => ({
  numero_parcela: numero,
  total_parcelas: 3,
  data_vencimento: new Date(`2026-11-${10 + numero}T00:00:00.000Z`),
  valor_final: valor,
  situacao,
  pagamentos_receber: pagos.map((p) => ({ valor: p })),
})

describe("montarParcelas", () => {
  it("usa os títulos a receber, ordenados, somando os recebimentos", () => {
    const parcelas = montarParcelas(
      [
        titulo(2, "100.00", ["30.00", "20.00"], "PARCIAL"),
        titulo(1, "100.00", ["100.00"], "PAGO"),
      ],
      [],
    )
    expect(parcelas.map((p) => p.numero)).toEqual([1, 2])
    expect(parcelas[0]).toMatchObject({
      origem: "TITULO",
      total: 3,
      vencimento: "2026-11-11",
      valor: "100.00",
      pago: "100.00",
      saldo: "0.00",
      situacao: "PAGA",
    })
    expect(parcelas[1]).toMatchObject({
      pago: "50.00",
      saldo: "50.00",
      situacao: "PARCIAL",
    })
  })

  it("não deixa saldo negativo e zera o saldo de parcela cancelada", () => {
    const [paga, cancelada] = montarParcelas(
      [
        titulo(1, "10.00", ["12.00"], "PAGO"),
        titulo(2, "10.00", [], "CANCELADO"),
      ],
      [],
    )
    expect(paga.saldo).toBe("0.00")
    expect(cancelada).toMatchObject({ saldo: "0.00", situacao: "CANCELADA" })
  })

  it("mantém o vencimento no dia certo, sem deslocar por fuso", () => {
    const [parcela] = montarParcelas(
      [{ ...titulo(1, "1.00", []), data_vencimento: new Date("2026-12-01") }],
      [],
    )
    expect(parcela.vencimento).toBe("2026-12-01")
  })

  it("sem títulos, cai para as parcelas antigas (venda_parcelas)", () => {
    const legadas: ParcelaLegada[] = [
      {
        numero_parcela: 1,
        data_vencimento: new Date("2026-11-10"),
        valor: "40.50",
        valor_pago: "10.25",
        status: "PARCIAL",
      },
    ]
    expect(montarParcelas([], legadas)).toEqual([
      {
        origem: "LEGADA",
        numero: 1,
        total: 1,
        vencimento: "2026-11-10",
        valor: "40.50",
        pago: "10.25",
        saldo: "30.25",
        situacao: "PARCIAL",
      },
    ])
  })

  it("venda sem parcelas devolve lista vazia", () => {
    expect(montarParcelas([], [])).toEqual([])
  })
})

describe("resumirParcelas", () => {
  it("soma valor, pago e saldo ignorando canceladas", () => {
    const parcelas = montarParcelas(
      [
        titulo(1, "33.33", ["10.00"]),
        titulo(2, "33.33", []),
        titulo(3, "33.34", [], "CANCELADO"),
      ],
      [],
    )
    expect(resumirParcelas(parcelas)).toEqual({
      valor: "66.66",
      pago: "10.00",
      saldo: "56.66",
    })
  })
})

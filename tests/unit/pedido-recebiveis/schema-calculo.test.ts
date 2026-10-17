import { describe, expect, it } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import {
  fecharSchema,
  MAX_PARCELAS,
} from "../../../src/modules/pedido-recebiveis/recebiveis.schema"
import { parcelar } from "../../../src/modules/pedido-recebiveis/recebiveis.calculo"

const plano = {
  idCategoriaFinanceira: 7,
  vencimentos: ["2026-11-10", "2026-12-10", "2027-01-10"],
}

describe("contrato estrito de fechamento comercial", () => {
  it("exige categoria explícita e preserva a sequência, inclusive datas iguais ou anteriores", () => {
    const input = {
      ...plano,
      vencimentos: ["2027-01-10", "2026-01-01", "2026-01-01"],
    }
    expect(fecharSchema.parse(input)).toEqual(input)
  })
  it.each([
    {},
    { vencimentos: plano.vencimentos },
    { idCategoriaFinanceira: 7 },
    { ...plano, vencimentos: [] },
    { ...plano, vencimentos: null },
  ])("rejeita plano incompleto %j", (input) =>
    expect(fecharSchema.safeParse(input).success).toBe(false),
  )
  it.each([0, -1, 1.1, "7", null, 2147483648])(
    "rejeita categoria inválida %s",
    (idCategoriaFinanceira) => {
      expect(
        fecharSchema.safeParse({ ...plano, idCategoriaFinanceira }).success,
      ).toBe(false)
    },
  )
  it.each([
    "total",
    "valorTotal",
    "valor_total",
    "subtotal",
    "saldo",
    "valores",
    "dataEntregaPrevista",
    "idEmpresa",
    "idUsuario",
    "status",
    "fechadoEm",
    "versao",
    "idCondicaoPagamento",
  ])("rejeita campo não permitido: %s", (campo) => {
    expect(
      fecharSchema.safeParse({ ...plano, [campo]: "100.00" }).success,
    ).toBe(false)
  })
  it.each([
    "2026-02-29",
    "2026-11-31",
    "2026-00-10",
    "2026-1-01",
    "0999-01-01",
    "2026-11-10T00:00:00Z",
    1794268800000,
  ])("rejeita vencimento inválido %s", (data) => {
    expect(
      fecharSchema.safeParse({ ...plano, vencimentos: [data] }).success,
    ).toBe(false)
  })
  it("aceita limites civis e bissexto sem transformar a data", () => {
    const vencimentos = ["1000-01-01", "2028-02-29", "9999-12-31"]
    expect(fecharSchema.parse({ ...plano, vencimentos }).vencimentos).toEqual(
      vencimentos,
    )
  })
  it("documenta o limite de 120 parcelas e impede excedê-lo", () => {
    expect(MAX_PARCELAS).toBe(120)
    expect(
      fecharSchema.safeParse({
        ...plano,
        vencimentos: Array(MAX_PARCELAS).fill("2026-11-10"),
      }).success,
    ).toBe(true)
    expect(
      fecharSchema.safeParse({
        ...plano,
        vencimentos: Array(MAX_PARCELAS + 1).fill("2026-11-10"),
      }).success,
    ).toBe(false)
  })
})

describe("parcelamento exato sem ponto flutuante", () => {
  it("gera uma única parcela de valor original integral", () => {
    const [parcela] = parcelar(new Prisma.Decimal("100.00"), ["2026-11-10"])
    expect(parcela).toMatchObject({
      numeroParcela: 1,
      totalParcelas: 1,
      vencimento: "2026-11-10",
    })
    expect(parcela.valor.toFixed(2)).toBe("100.00")
  })
  it("aplica o resíduo de 100.00 dividido em três apenas à última parcela", () => {
    const parcelas = parcelar(new Prisma.Decimal("100.00"), plano.vencimentos)
    expect(parcelas.map((p) => p.valor.toFixed(2))).toEqual([
      "33.33",
      "33.33",
      "33.34",
    ])
    expect(parcelas.map((p) => p.numeroParcela)).toEqual([1, 2, 3])
    expect(parcelas.every((p) => p.totalParcelas === 3)).toBe(true)
    expect(
      parcelas
        .reduce((s, p) => s.plus(p.valor), new Prisma.Decimal(0))
        .toFixed(2),
    ).toBe("100.00")
  })
  it("não ordena nem altera vencimentos ou o total de entrada", () => {
    const vencimentos = Object.freeze([
      "2027-01-10",
      "2026-11-10",
      "2026-11-10",
    ])
    const total = new Prisma.Decimal("0.05")
    expect(parcelar(total, vencimentos).map((p) => p.vencimento)).toEqual(
      vencimentos,
    )
    expect(total.toFixed(2)).toBe("0.05")
  })
  it.each(["0.01", "0.02"])(
    "não cria parcela zero para %s em três vencimentos",
    (total) => {
      expect(() =>
        parcelar(new Prisma.Decimal(total), plano.vencimentos),
      ).toThrow(expect.objectContaining({ status: 400 }))
    },
  )
  it("aceita precisamente um centavo por parcela", () => {
    expect(
      parcelar(new Prisma.Decimal("0.03"), plano.vencimentos).map((p) =>
        p.valor.toFixed(2),
      ),
    ).toEqual(["0.01", "0.01", "0.01"])
  })
  it.each(["0", "-1.00", "0.001", "10000000000000.00", "NaN", "Infinity"])(
    "rejeita total persistido incompatível %s",
    (total) => {
      expect(() =>
        parcelar(new Prisma.Decimal(total), plano.vencimentos),
      ).toThrow(expect.objectContaining({ status: 409 }))
    },
  )
  it.each([
    { vencimentos: [] },
    { vencimentos: ["2026-02-29"] },
    { vencimentos: Array(MAX_PARCELAS + 1).fill("2026-11-10") },
  ])("valida defensivamente o plano %j", ({ vencimentos }) => {
    expect(() => parcelar(new Prisma.Decimal("100.00"), vencimentos)).toThrow(
      expect.objectContaining({ status: 400 }),
    )
  })
  it("preserva o máximo do banco em 120 parcelas exatas", () => {
    const total = new Prisma.Decimal("9999999999999.99")
    const parcelas = parcelar(total, Array(MAX_PARCELAS).fill("9999-12-31"))
    expect(parcelas).toHaveLength(MAX_PARCELAS)
    expect(
      parcelas.every((p) => p.valor.gt(0) && p.valor.mul(100).isInteger()),
    ).toBe(true)
    expect(
      parcelas
        .reduce((s, p) => s.plus(p.valor), new Prisma.Decimal(0))
        .eq(total),
    ).toBe(true)
    expect(parcelas[0].valor.toFixed(2)).toBe("83333333333.33")
    expect(parcelas.at(-1)?.valor.toFixed(2)).toBe("83333333333.72")
  })
})

import { describe, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { conferirValorRecebido } from "@/modules/recebimentos/recebimentos.service"
import {
  chaveRecebimento,
  recebimentoSchema,
} from "@/modules/recebimentos/recebimentos.schema"

const decimal = (v: string) => new Prisma.Decimal(v)
const entrada = {
  valor: "10.01",
  data: "2026-11-01",
  formaPagamento: "PIX",
  idContaBancaria: 1,
}
describe("recebimentos exatos e contrato", () => {
  it("mantém centavos sem arredondar e encerra somente após consumir o saldo", () => {
    const parcial = conferirValorRecebido(
      decimal("100"),
      decimal("33.33"),
      "33.33",
    )
    expect(parcial.saldo.toFixed(2)).toBe("33.34")
    expect(parcial.situacao).toBe("PARCIAL")
    const final = conferirValorRecebido(
      decimal("100"),
      decimal("66.66"),
      "33.34",
    )
    expect(final.saldo.toFixed(2)).toBe("0.00")
    expect(final.situacao).toBe("PAGO")
  })
  it.each(["0", "-1", "100.01", "0.001"])(
    "rejeita baixa indevida %s",
    (valor) => {
      expect(() =>
        conferirValorRecebido(decimal("100"), decimal("0"), valor),
      ).toThrow()
    },
  )
  it("rejeita título quitado e saldo já inconsistente", () => {
    expect(() =>
      conferirValorRecebido(decimal("100"), decimal("100"), "0.01"),
    ).toThrow()
    expect(() =>
      conferirValorRecebido(decimal("100"), decimal("101"), "0.01"),
    ).toThrow()
  })
  it.each(["-1", "0", "0.00", "1e2", "1.001", "1,00", "10000000000000", " 1"])(
    "não aceita valor %s nem o arredonda",
    (valor) => {
      expect(recebimentoSchema.safeParse({ ...entrada, valor }).success).toBe(
        false,
      )
    },
  )
  it.each(["2026-02-29", "2026-04-31", "0000-01-01", "2026-11-01T00:00:00Z"])(
    "valida dia civil %s",
    (data) => {
      expect(recebimentoSchema.safeParse({ ...entrada, data }).success).toBe(
        false,
      )
    },
  )
  it("normaliza opcionais, não aceita usuário/empresa/saldo enviados", () => {
    expect(
      recebimentoSchema.parse({
        ...entrada,
        referencia: "  ",
        observacao: "  recibo  ",
      }),
    ).toEqual({ ...entrada, referencia: null, observacao: "recibo" })
    for (const campo of ["id_empresa", "id_usuario", "saldo", "situacao"])
      expect(
        recebimentoSchema.safeParse({ ...entrada, [campo]: 1 }).success,
      ).toBe(false)
  })
  it("exige chave ASCII limitada e preserva a caixa", () => {
    expect(chaveRecebimento.parse("Receber-123")).toBe("Receber-123")
    for (const chave of [
      "curta",
      "çhaves-123",
      "chave com espaço",
      "x".repeat(129),
    ])
      expect(chaveRecebimento.safeParse(chave).success).toBe(false)
  })
})

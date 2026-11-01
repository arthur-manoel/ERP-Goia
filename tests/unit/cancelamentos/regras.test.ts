import { describe, it, expect } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import {
  apurarPrazo,
  limiteSolicitacao,
  creditoEntrega,
  ratearPedido,
} from "../../../src/modules/cancelamentos/cancelamentos.calculo"
import { calcularCobranca } from "../../../src/modules/recebimentos/recebimentos.saldo"
import {
  solicitarSchema,
  devolucaoSchema,
  reembolsoSchema,
  decisaoSchema,
} from "../../../src/modules/cancelamentos/cancelamentos.schema"
const d = (v: string) => new Prisma.Decimal(v)
const item = (id: number, q = "3.000", v = "30.00") => ({
  id,
  quantidade: d(q),
  valor_total: d(v),
})
describe("Prazo histórico do cancelamento", () => {
  it("inclui fins de semana e mantém o instante exato do limite", () => {
    const data = new Date("2026-10-23T15:20:30.123Z")
    const limite = limiteSolicitacao(data)
    expect(limite.toISOString()).toBe("2026-10-30T15:20:30.123Z")
    expect(apurarPrazo(data, true, limite).exigeAprovacao).toBe(false)
    expect(
      apurarPrazo(data, true, new Date(limite.getTime() + 1)).exigeAprovacao,
    ).toBe(true)
  })
  it("usa dias civis inclusive ao atravessar a mudança histórica de horário", () => {
    expect(
      limiteSolicitacao(new Date("2018-10-28T15:00:00Z")).toISOString(),
    ).toBe("2018-11-04T14:00:00.000Z")
    expect(
      limiteSolicitacao(new Date("2019-02-10T14:00:00Z")).toISOString(),
    ).toBe("2019-02-17T15:00:00.000Z")
  })
  it("encaminha data ausente, futura ou inválida para análise", () => {
    for (const data of [
      null,
      new Date("invalid"),
      new Date("2099-01-01T12:00:00Z"),
    ]) {
      expect(
        apurarPrazo(data, true, new Date("2026-11-01T12:00:00Z")),
      ).toMatchObject({
        inconsistente: true,
        exigeAprovacao: true,
        limite: null,
      })
    }
    expect(apurarPrazo(null, false).exigeAprovacao).toBe(false)
  })
})
describe("Crédito proporcional completo de entrega", () => {
  it("rateia frete e ajustes do total com centavos exatos por maiores restos", () => {
    const itens = [item(3, "1", "10"), item(1, "1", "10"), item(2, "1", "10")]
    const valores = ratearPedido(d("100.01"), itens)
    expect(String(valores.get(1))).toBe("3334")
    expect(String(valores.get(2))).toBe("3334")
    expect(String(valores.get(3))).toBe("3333")
  })
  it("devoluções fracionadas acumulam o total completo sem perder ou criar centavos", () => {
    const itens = [item(7)]
    const a = creditoEntrega(
      d("100.01"),
      itens,
      new Map(),
      new Map([[7, d("1")]]),
    )
    const b = creditoEntrega(
      d("100.01"),
      itens,
      new Map([[7, d("1")]]),
      new Map([[7, d("1")]]),
    )
    const c = creditoEntrega(
      d("100.01"),
      itens,
      new Map([[7, d("2")]]),
      new Map([[7, d("1")]]),
    )
    expect([
      a.valor.toFixed(2),
      b.valor.toFixed(2),
      c.valor.toFixed(2),
    ]).toEqual(["33.33", "33.34", "33.34"])
    expect(a.valor.plus(b.valor).plus(c.valor).toFixed(2)).toBe("100.01")
  })
  it("mantém precisão no limite monetário do banco e na quantidade fracionária", () => {
    const r = creditoEntrega(
      d("9999999999999.99"),
      [item(1, "999999999999.999", "9999999999999.99")],
      new Map(),
      new Map([[1, d("999999999999.999")]]),
    )
    expect(r.valor.toFixed(2)).toBe("9999999999999.99")
  })
  it("rateia por quantidade quando todos os itens têm valor líquido zero", () => {
    const valores = ratearPedido(d("10.00"), [
      item(1, "1", "0"),
      item(2, "3", "0"),
    ])
    expect(String(valores.get(1))).toBe("250")
    expect(String(valores.get(2))).toBe("750")
  })
  it("rejeita quantidade acima do original, produto alheio e crédito negativo", () => {
    expect(() =>
      creditoEntrega(
        d("100"),
        [item(1)],
        new Map([[1, d("2")]]),
        new Map([[1, d("2")]]),
      ),
    ).toThrow()
    expect(() =>
      creditoEntrega(d("100"), [item(1)], new Map(), new Map([[9, d("1")]])),
    ).toThrow()
    expect(() => ratearPedido(d("-1"), [item(1)])).toThrow()
  })
})
describe("Compensação vinculada à cobrança", () => {
  it("reduz saldo sem alterar o total original ou pagamentos", () => {
    const r = calcularCobranca(d("100"), d("30"), [
      { valor: d("40"), saldo_anulado: d("40"), valor_restituir: d("0") },
    ])
    expect(r.saldo.toFixed(2)).toBe("30.00")
    expect(r.exigivel.toFixed(2)).toBe("60.00")
    expect(r.situacao).toBe("PARCIAL")
  })
  it("cancela saldo e conserva obrigação de restituir pagamentos existentes", () => {
    const r = calcularCobranca(d("100"), d("30"), [
      { valor: d("100"), saldo_anulado: d("70"), valor_restituir: d("30") },
    ])
    expect(r.saldo.toFixed(2)).toBe("0.00")
    expect(r.restituir.toFixed(2)).toBe("30.00")
    expect(r.situacao).toBe("CANCELADO")
  })
  it("rejeita crédito sem decomposição, excesso ou restituição sem lastro", () => {
    for (const c of [
      { valor: d("100"), saldo_anulado: d("80"), valor_restituir: d("20") },
      { valor: d("101"), saldo_anulado: d("71"), valor_restituir: d("30") },
      { valor: d("100"), saldo_anulado: d("70"), valor_restituir: d("29") },
    ])
      expect(() => calcularCobranca(d("100"), d("30"), [c])).toThrow()
  })
})
describe("Contrato de etapas humanas", () => {
  it("não aceita empresa, aprovação ou valor de crédito enviados pelo cliente", () => {
    const base = {
      tipo: "PEDIDO",
      motivo: "Motivo válido",
      hashEstado: "a".repeat(64),
    }
    expect(solicitarSchema.safeParse(base).success).toBe(true)
    for (const campo of ["idEmpresa", "aprovado", "credito", "idSolicitante"])
      expect(solicitarSchema.safeParse({ ...base, [campo]: 1 }).success).toBe(
        false,
      )
  })
  it("exige destino completo no retorno aproveitável e não libera avaria", () => {
    const base = {
      idLinha: 1,
      quantidade: "1.000",
      observacao: "Retorno recebido",
    }
    expect(
      devolucaoSchema.safeParse({ ...base, condicao: "APROVEITAVEL" }).success,
    ).toBe(false)
    expect(
      devolucaoSchema.safeParse({ ...base, condicao: "AVARIADA" }).success,
    ).toBe(true)
    expect(
      devolucaoSchema.safeParse({
        ...base,
        condicao: "AVARIADA",
        idLocalEstoque: 1,
        idSetor: 2,
      }).success,
    ).toBe(false)
    expect(
      devolucaoSchema.safeParse({
        ...base,
        quantidade: "",
        condicao: "AVARIADA",
      }).success,
    ).toBe(false)
  })
  it("exige decisão explícita e data civil real para restituição", () => {
    expect(
      decisaoSchema.safeParse({ decisao: "APROVADA", motivo: "ok" }).success,
    ).toBe(false)
    expect(
      reembolsoSchema.safeParse({
        idCredito: 1,
        valor: "10.00",
        data: "2026-02-30",
        idContaBancaria: 1,
      }).success,
    ).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import {
  criarSchema,
  editarSchema,
  editarItemSchema,
  itemSchema,
  listarSchema,
  dataCivilSchema,
  quantidadeSchema,
  precoSchema,
  versaoHeaderSchema,
  chaveSchema,
} from "../../../src/modules/pedidos/pedidos.schema"
import {
  subtotal,
  total,
  dataCivil,
} from "../../../src/modules/pedidos/pedidos.calculo"

const item = {
  idProduto: 25,
  idVariacao: 80,
  quantidade: "3.000",
  precoPraticado: "49.90",
}
const pedido = {
  idCliente: 12,
  dataEntregaPrevista: "2026-11-15",
  itens: [item],
}
describe("contrato estrito de pedidos", () => {
  it("normaliza apenas escalas permitidas, sem alterar preço negociado", () => {
    expect(
      itemSchema.parse({ ...item, quantidade: "3", precoPraticado: "49.9" }),
    ).toMatchObject({ quantidade: "3.000", precoPraticado: "49.90" })
    expect(
      itemSchema.parse({ ...item, idVariacao: undefined }).idVariacao,
    ).toBeNull()
  })
  it("permite variações diferentes e rejeita repetição da mesma combinação", () => {
    expect(
      criarSchema.safeParse({
        ...pedido,
        itens: [item, { ...item, idVariacao: 81 }],
      }).success,
    ).toBe(true)
    for (const itens of [
      [item, item],
      [
        { ...item, idVariacao: null },
        { ...item, idVariacao: null },
      ],
    ])
      expect(criarSchema.safeParse({ ...pedido, itens }).success).toBe(false)
  })
  it.each([
    "total",
    "valorTotal",
    "valor_total",
    "subtotal",
    "idEmpresa",
    "id_empresa",
    "idUsuario",
    "id_usuario",
    "numero",
    "saldoFinanceiro",
    "fechadoEm",
    "status",
    "versao",
  ])("rejeita campo controlado pelo servidor: %s", (campo) => {
    expect(criarSchema.safeParse({ ...pedido, [campo]: 1 }).success).toBe(false)
    expect(editarSchema.safeParse({ [campo]: 1 }).success).toBe(false)
  })
  it.each([
    "total",
    "subtotal",
    "valor_total",
    "idCor",
    "idTamanho",
    "desconto",
  ])("rejeita campo extra de item: %s", (campo) => {
    expect(itemSchema.safeParse({ ...item, [campo]: 1 }).success).toBe(false)
    expect(editarItemSchema.safeParse({ [campo]: 1 }).success).toBe(false)
  })
  it.each([0, -1, 1.1, 2147483648, "12", null])(
    "rejeita ID JSON inválido %s",
    (idCliente) =>
      expect(criarSchema.safeParse({ ...pedido, idCliente }).success).toBe(
        false,
      ),
  )
  it.each([
    "0",
    "-1",
    "1.0001",
    "1e3",
    "01",
    "1,2",
    "1000000000000",
    "NaN",
    "Infinity",
    " 1",
    1,
  ])("rejeita quantidade %s", (v) =>
    expect(quantidadeSchema.safeParse(v).success).toBe(false),
  )
  it.each(["-1", "1.001", "1e3", "01", "1,2", "10000000000000", "NaN", 1])(
    "rejeita preço %s",
    (v) => expect(precoSchema.safeParse(v).success).toBe(false),
  )
  it("aceita os limites reais e preço zero, sem precisão excedente", () => {
    expect(quantidadeSchema.parse("999999999999.999")).toBe("999999999999.999")
    expect(precoSchema.parse("9999999999999.99")).toBe("9999999999999.99")
    expect(precoSchema.parse("0")).toBe("0.00")
  })
  it.each([
    "2026-02-29",
    "2026-11-31",
    "2026-00-01",
    "2026-11-15T00:00:00Z",
    "0999-11-15",
    "2026-1-01",
  ])("rejeita data civil %s", (v) =>
    expect(dataCivilSchema.safeParse(v).success).toBe(false),
  )
  it("valida bissexto e não desloca dia", () => {
    expect(dataCivilSchema.parse("2028-02-29")).toBe("2028-02-29")
    expect(dataCivil("2026-11-15").toISOString()).toBe(
      "2026-11-15T00:00:00.000Z",
    )
  })
  it("limita itens e exige ao menos um", () => {
    for (const itens of [
      [],
      Array.from({ length: 101 }, (_, i) => ({ ...item, idVariacao: i + 1 })),
    ])
      expect(criarSchema.safeParse({ ...pedido, itens }).success).toBe(false)
  })
  it("edições vazias são inválidas", () => {
    expect(editarSchema.safeParse({}).success).toBe(false)
    expect(editarItemSchema.safeParse({}).success).toBe(false)
  })
  it("valida filtros, intervalo e paginação", () => {
    expect(listarSchema.parse({})).toEqual({ pagina: 1, limite: 25 })
    for (const filtros of [
      { pagina: "0" },
      { limite: "101" },
      { idCliente: "2147483648" },
      { status: "FATURADA" },
      { id_empresa: "1" },
      { dataInicio: "2026-11-16", dataFim: "2026-11-15" },
    ])
      expect(listarSchema.safeParse(filtros).success).toBe(false)
  })
  it("exige chave válida e versão forte explícita", () => {
    expect(chaveSchema.parse("pedido-1234")).toBe("pedido-1234")
    expect(versaoHeaderSchema.parse('"1"')).toBe(1)
    for (const value of [
      null,
      "*",
      "1",
      'W/"1"',
      '"0"',
      '"2147483648"',
      '"01"',
    ])
      expect(versaoHeaderSchema.safeParse(value).success).toBe(false)
  })
})
describe("cálculo exclusivamente decimal", () => {
  it("calcula exemplo 259.50", () =>
    expect(
      total([
        subtotal("3.000", "49.90"),
        subtotal("2.000", "54.90"),
      ]).total.toFixed(2),
    ).toBe("259.50"))
  it("arredonda HALF_UP em cada subtotal antes da soma", () => {
    expect(subtotal("0.125", "0.12").toFixed(2)).toBe("0.02")
    expect(
      total([
        subtotal("0.125", "0.12"),
        subtotal("0.125", "0.12"),
      ]).total.toFixed(2),
    ).toBe("0.04")
  })
  it("preserva ajustes legados sem inventar novos", () =>
    expect(
      total(
        [subtotal("3.000", "10.00", "1.00", "2.00")],
        "3.00",
        "4.00",
        "5.00",
      ).total.toFixed(2),
    ).toBe("37.00"))
  it("impede overflow de item e agregado", () => {
    expect(() => subtotal("999999999999.999", "9999999999999.99")).toThrow()
    expect(() =>
      total([
        new Prisma.Decimal("9999999999999.99"),
        new Prisma.Decimal("0.01"),
      ]),
    ).toThrow()
    expect(() => subtotal("1.000", "1.00", "2.00")).toThrow()
  })
})

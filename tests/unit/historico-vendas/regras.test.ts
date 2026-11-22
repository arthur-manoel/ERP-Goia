import { describe, expect, it } from "vitest"
import {
  descreverMudanca,
  filtrarVendas,
  formatarDiaIso,
  variacaoStatus,
} from "@/features/historico-vendas/regras"
import type {
  EventoStatus,
  VendaLista,
} from "@/features/historico-vendas/tipos"

const venda = (
  id: number,
  numero: string,
  status: VendaLista["status"],
  cliente: string | null,
  produto = "Camiseta",
  pedido = "—",
): VendaLista => ({
  id,
  numero,
  cliente,
  pedido,
  data: "2026-11-20T12:00:00.000Z",
  status,
  subtotal: "10.00",
  desconto: "0.00",
  frete: "0.00",
  acrescimo: "0.00",
  total: "10.00",
  items: [
    {
      idProduto: id,
      produto,
      codigo: `P${id}`,
      variacao: "",
      quantidade: "1.000",
      unitario: "10.00",
      total: "10.00",
    },
  ],
})

const lista = [
  venda(1, "PDV-2026-AAA", "CONFIRMADA", "João Açaí"),
  venda(2, "PED-2026-0007", "CANCELADA", null, "Bermuda", "PED-7"),
  venda(3, "PDV-2026-CCC", "ENTREGUE", "Maria"),
]

describe("filtrarVendas", () => {
  it("filtra por status", () => {
    expect(filtrarVendas(lista, "", "CANCELADA").map((v) => v.id)).toEqual([2])
    expect(filtrarVendas(lista, "", "todos")).toHaveLength(3)
  })
  it("busca sem acento por número, cliente, pedido e produto", () => {
    expect(filtrarVendas(lista, "acai", "todos").map((v) => v.id)).toEqual([1])
    expect(filtrarVendas(lista, "ped-7", "todos").map((v) => v.id)).toEqual([2])
    expect(filtrarVendas(lista, "bermuda", "todos").map((v) => v.id)).toEqual([
      2,
    ])
    expect(filtrarVendas(lista, "p3", "todos").map((v) => v.id)).toEqual([3])
  })
  it("combina busca e status", () => {
    expect(filtrarVendas(lista, "pdv", "ENTREGUE").map((v) => v.id)).toEqual([
      3,
    ])
  })
})

describe("apresentação", () => {
  const evento = (
    anterior: EventoStatus["statusAnterior"],
    novo: EventoStatus["statusNovo"],
  ): EventoStatus => ({
    id: 1,
    statusAnterior: anterior,
    statusNovo: novo,
    observacao: null,
    data: "2026-11-20T12:00:00.000Z",
    usuario: null,
  })
  it("descreve a mudança de status", () => {
    expect(descreverMudanca(evento("RASCUNHO", "CONFIRMADA"))).toBe(
      "Rascunho → Confirmada",
    )
    expect(descreverMudanca(evento(null, "RASCUNHO"))).toBe(
      "Criada como Rascunho",
    )
  })
  it("formata o dia sem passar por Date", () => {
    expect(formatarDiaIso("2026-12-01")).toBe("01/12/2026")
  })
  it("destaca cancelada em vermelho", () => {
    expect(variacaoStatus("CANCELADA")).toBe("destructive")
  })
})

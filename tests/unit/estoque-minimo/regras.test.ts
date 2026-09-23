import { describe, expect, it } from "vitest"
import {
  calcularDeficit,
  classificarPosicao,
  ordenarPosicoes,
} from "../../../src/features/estoque-minimo/regras"
import { configurarMinimoSchema } from "../../../src/modules/estoque-minimo/estoque-minimo.schema"
import type { PosicaoEstoque } from "../../../src/features/estoque-minimo/tipos"
import { montarIndicadorEstoque } from "../../../src/lib/dashboard/estoque"

const posicao = (
  idEstoque: number,
  quantidade: string,
  minimo: string | null,
  local = `Local ${idEstoque}`,
): PosicaoEstoque => ({
  idEstoque,
  idProduto: 1,
  idLocalEstoque: idEstoque,
  produto: "Produto",
  codigo: "P-1",
  tipo: "Tecido",
  local,
  unidade: "m",
  quantidade,
  minimo,
  deficit: calcularDeficit(quantidade, minimo),
  estado: classificarPosicao(quantidade, minimo),
  ehInsumo: true,
})

describe("alerta de estoque físico por local", () => {
  it.each([
    ["5.000", "5.000", "NO_MINIMO"],
    ["4.999", "5.000", "ABAIXO_MINIMO"],
    ["5.001", "5.000", "REGULAR"],
    ["0.000", "5.000", "SEM_ESTOQUE"],
    ["0.000", null, "NAO_CONFIGURADO"],
  ] as const)("classifica saldo %s e mínimo %s", (saldo, minimo, esperado) => {
    expect(classificarPosicao(saldo, minimo)).toBe(esperado)
  })

  it("calcula déficit exato sem float", () => {
    expect(calcularDeficit("0.001", "0.010")).toBe("0.009")
    expect(calcularDeficit("10.000", "2.000")).toBe("0.000")
    expect(calcularDeficit("1.000", null)).toBeNull()
  })

  it("ordena zerado, maior déficit, demais críticos e não configurados", () => {
    const ordenadas = ordenarPosicoes([
      posicao(1, "9.000", null),
      posicao(2, "5.000", "5.000"),
      posicao(3, "4.000", "10.000"),
      posicao(4, "0.000", "2.000"),
      posicao(5, "8.000", "10.000"),
    ])
    expect(ordenadas.map((item) => item.idEstoque)).toEqual([4, 3, 5, 2, 1])
  })

  it("mantém locais diferentes do mesmo produto e alimenta o dashboard", () => {
    const posicoes = ordenarPosicoes([
      posicao(1, "5.000", "5.000", "Fábrica"),
      posicao(2, "2.000", "7.000", "Loja"),
      posicao(3, "0.000", "1.000", "Depósito"),
      posicao(4, "10.000", "2.000", "Expedição"),
      posicao(5, "1.000", null, "Mostruário"),
    ])
    const dashboard = montarIndicadorEstoque(posicoes)
    expect(dashboard.total).toBe(3)
    expect(dashboard.semEstoque).toBe(1)
    expect(dashboard.semMinimo).toBe(1)
    expect(dashboard.totalMonitorados).toBe(4)
    expect(dashboard.maisCriticos?.map((item) => item.local)).toEqual([
      "Depósito",
      "Loja",
      "Fábrica",
    ])
  })
})

describe("validação da configuração", () => {
  it("aceita o contrato JSON decimal com três casas", () => {
    expect(
      configurarMinimoSchema.parse({
        idProduto: 1,
        idLocalEstoque: 2,
        quantidadeMinima: "12.345",
      }),
    ).toEqual({
      idProduto: 1,
      idLocalEstoque: 2,
      quantidadeMinima: "12.345",
    })
  })

  it.each(["-1", "1.0001", "", "1000000000000", "1,000"])(
    "recusa quantidade inválida %s",
    (quantidadeMinima) => {
      expect(
        configurarMinimoSchema.safeParse({
          idProduto: 1,
          idLocalEstoque: 2,
          quantidadeMinima,
        }).success,
      ).toBe(false)
    },
  )
})

import { describe, expect, it } from "vitest"
import {
  calcularPaginacao,
  validarConsulta,
} from "@/modules/kardex/kardex.schema"

describe("consulta Kardex", () => {
  it("usa os últimos trinta dias civis de São Paulo", () => {
    const consulta = validarConsulta({}, new Date("2026-11-12T02:59:59Z"))
    expect(consulta.periodo).toEqual({
      dataInicio: "2026-10-13",
      dataFim: "2026-11-11",
    })
    expect(consulta.inicio.toISOString()).toBe("2026-10-13T03:00:00.000Z")
    expect(consulta.fim.toISOString()).toBe("2026-11-12T03:00:00.000Z")
    expect(consulta).toMatchObject({ pagina: 1, limite: 25 })
  })

  it("respeita a data civil histórica em horário de verão", () => {
    const consulta = validarConsulta({
      dataInicio: "2018-11-04",
      dataFim: "2018-11-04",
    })
    expect(consulta.inicio.toISOString()).toBe("2018-11-04T03:00:00.000Z")
    expect(consulta.fim.toISOString()).toBe("2018-11-05T02:00:00.000Z")
  })

  it.each([
    { limite: 100, ultima: 1001 },
    { limite: 10, ultima: 10000 },
    { limite: 33, ultima: 3031 },
  ])(
    "anuncia e aceita a mesma última página com limite $limite",
    ({ limite, ultima }) => {
      const totalRegistros = 500_000
      const paginacao = calcularPaginacao(1, limite, totalRegistros)
      expect(paginacao).toEqual({
        pagina: 1,
        limite,
        totalRegistros,
        totalPaginas: ultima,
        totalPaginasReais: Math.ceil(totalRegistros / limite),
      })
      expect(
        validarConsulta({ pagina: String(ultima), limite: String(limite) })
          .pagina,
      ).toBe(ultima)
      expect(() =>
        validarConsulta({ pagina: String(ultima + 1), limite: String(limite) }),
      ).toThrow()
    },
  )

  it.each([
    [0, 0],
    [101, 2],
    [100_100, 1001],
  ])(
    "preserva a contagem de %i registros dentro da fronteira",
    (registros, paginas) => {
      expect(calcularPaginacao(1, 100, registros)).toMatchObject({
        totalRegistros: registros,
        totalPaginas: paginas,
        totalPaginasReais: paginas,
      })
    },
  )

  it.each([
    { dataInicio: "2026-11-12" },
    { dataInicio: "2026-02-30", dataFim: "2026-03-05" },
    { dataInicio: "2026-11-12", dataFim: "2026-11-11" },
    { dataInicio: "2025-01-01", dataFim: "2026-01-02" },
    { limite: "101" },
    { pagina: "10002" },
    { pagina: "2000", limite: "100" },
    { idProduto: "2147483648" },
    { idSetor: "1.5" },
    { idEmpresa: "4" },
    { direcao: "ENTRADA", tipo: "TRANSFERENCIA_SAIDA" },
    { origemId: "1" },
  ])("rejeita consulta inválida %o", (f) => {
    expect(() => validarConsulta(f)).toThrow()
  })
})

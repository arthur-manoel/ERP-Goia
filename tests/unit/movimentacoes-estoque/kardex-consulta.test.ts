import { describe, expect, it } from "vitest"
import { validarConsulta } from "@/modules/kardex/kardex.schema"

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

import { describe, expect, it, vi } from "vitest"
import { carregarIndicadores } from "@/components/dashboard/carregar-indicadores"

const concluir = () => new Promise((resolve) => setTimeout(resolve, 0))
describe("carregamento independente da dashboard", () => {
  it("preserva os outros resultados quando um indicador falha e oculta o proibido", async () => {
    const receber = vi.fn()
    const requisitar = vi.fn(async (url: string) => {
      if (url.endsWith("ordens")) throw new Error("Offline")
      if (url.endsWith("saldo")) return new Response(null, { status: 403 })
      return Response.json({
        data: {
          estado: "ok",
          dados: {
            total: 8,
            atrasados: 1,
            vencemHoje: 0,
            proximos: { quantidade: 0, janelaDias: 7 },
          },
        },
      })
    })
    const cancelar = carregarIndicadores(requisitar, receber)
    await concluir()
    expect(receber.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining([
        { ordens: { estado: "erro" } },
        { saldo: { estado: "sem_permissao" } },
        {
          pedidos: {
            estado: "ok",
            dados: {
              total: 8,
              atrasados: 1,
              vencemHoje: 0,
              proximos: { quantidade: 0, janelaDias: 7 },
            },
          },
        },
      ]),
    )
    expect(requisitar).toHaveBeenCalledTimes(4)
    cancelar()
  })
  it("carrega estoque pela API existente e respeita a falta de permissão", async () => {
    const receber = vi.fn()
    const requisitar = vi.fn(async (url: string) =>
      url === "/api/estoque-minimo"
        ? Response.json({ indicador: { total: 2, maisCriticos: [] } })
        : new Response(null, { status: 403 }),
    )
    const cancelar = carregarIndicadores(requisitar, receber)
    await concluir()
    expect(receber).toHaveBeenCalledWith({
      estoque: { estado: "ok", dados: { total: 2, maisCriticos: [] } },
    })
    cancelar()
    receber.mockClear()
    const cancelarNegado = carregarIndicadores(
      async () => new Response(null, { status: 403 }),
      receber,
    )
    await concluir()
    expect(receber).toHaveBeenCalledWith({
      estoque: { estado: "sem_permissao" },
    })
    cancelarNegado()
  })
  it.each([
    {},
    { data: null },
    { data: { estado: "ok" } },
    { data: { estado: "ok", dados: {} } },
    { data: { estado: "ok", dados: [] } },
  ])(
    "converte resposta incompleta em erro em vez de carregamento infinito",
    async (body) => {
      const receber = vi.fn()
      const cancelar = carregarIndicadores(
        async () => Response.json(body),
        receber,
      )
      await concluir()
      expect(receber).toHaveBeenCalledTimes(4)
      for (const [resultado] of receber.mock.calls)
        expect(Object.values(resultado)).toEqual([{ estado: "erro" }])
      cancelar()
    },
  )
  it.each([
    ["pedidos", { total: 1, atrasados: 0, vencemHoje: 0, proximos: null }],
    [
      "pedidos",
      {
        total: 1,
        atrasados: 2,
        vencemHoje: 0,
        proximos: { quantidade: 0, janelaDias: 7 },
      },
    ],
    ["ordens", { total: 1, porStatus: {} }],
    [
      "ordens",
      { total: 1, porStatus: [{ rotulo: "Planejada", quantidade: 2 }] },
    ],
    ["saldo", { valor: "NaN", evolucaoDiaria: [] }],
    ["saldo", { valor: "10.00", evolucaoDiaria: "inválido" }],
    ["estoque", { total: 1, maisCriticos: [{}] }],
  ])(
    "recusa dados internos inválidos de %s sem derrubar os outros cards",
    async (indicador, dados) => {
      const receber = vi.fn()
      const cancelar = carregarIndicadores(async (url) => {
        if (
          url.endsWith(indicador) ||
          (indicador === "estoque" && url.endsWith("estoque-minimo"))
        )
          return Response.json(
            indicador === "estoque"
              ? { indicador: dados }
              : { data: { estado: "ok", dados } },
          )
        return new Response(null, { status: 403 })
      }, receber)
      await concluir()
      expect(receber).toHaveBeenCalledWith({ [indicador]: { estado: "erro" } })
      expect(receber).toHaveBeenCalledTimes(4)
      cancelar()
    },
  )
  it("descarta respostas da empresa anterior mesmo quando o transporte ignora o cancelamento", async () => {
    const receber = vi.fn()
    let responder!: (r: Response) => void
    const pendente = new Promise<Response>((resolve) => {
      responder = resolve
    })
    const cancelar = carregarIndicadores(() => pendente, receber)
    cancelar()
    responder(Response.json({ data: { estado: "ok", dados: { total: 999 } } }))
    await concluir()
    expect(receber).not.toHaveBeenCalled()
  })
  it("cancela as quatro requisições e descarta erros após desmontar", async () => {
    const receber = vi.fn()
    let signal: AbortSignal | undefined
    const cancelar = carregarIndicadores(async (_url, init) => {
      signal = init?.signal as AbortSignal
      throw new Error("Falha")
    }, receber)
    cancelar()
    await concluir()
    expect(signal?.aborted).toBe(true)
    expect(receber).not.toHaveBeenCalled()
  })
})

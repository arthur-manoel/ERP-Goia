import { describe, expect, it, vi } from "vitest"
import { carregarIndicadores } from "@/components/dashboard/carregar-indicadores"

const concluir = () => new Promise((resolve) => setTimeout(resolve, 0))
describe("carregamento independente da dashboard", () => {
  it("preserva os outros resultados quando um indicador falha e oculta o proibido", async () => {
    const receber = vi.fn()
    const requisitar = vi.fn(async (url: string) => {
      if (url.endsWith("ordens")) throw new Error("Offline")
      if (url.endsWith("saldo")) return new Response(null, { status: 403 })
      return Response.json({ data: { estado: "ok", dados: { total: 8 } } })
    })
    const cancelar = carregarIndicadores(requisitar, receber)
    await concluir()
    expect(receber.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining([
        { ordens: { estado: "erro" } },
        { saldo: { estado: "sem_permissao" } },
        { pedidos: { estado: "ok", dados: { total: 8 } } },
      ]),
    )
    expect(requisitar).toHaveBeenCalledTimes(3)
    cancelar()
  })
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
  it("cancela as três requisições e descarta erros após desmontar", async () => {
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

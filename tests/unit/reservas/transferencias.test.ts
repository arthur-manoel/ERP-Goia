import { describe, expect, it, vi } from "vitest"
import { lerRespostaOperacao } from "@/features/erp/resposta-operacao"
import { saldoTransferivel } from "@/features/reservas/quantidades"
import { receberTransferenciaSchema } from "@/modules/reservas/reservas.schema"

describe("conferência de transferência", () => {
  it("rejeita contagem ausente, negativa ou com excesso de precisão", () => {
    for (const quantidade of [
      undefined,
      "",
      "-1",
      "abc",
      "6.0001",
      "1234567890123",
    ]) {
      expect(receberTransferenciaSchema.safeParse({ quantidade }).success).toBe(
        false,
      )
    }
    expect(
      receberTransferenciaSchema.parse({ quantidade: "0.000" }).quantidade,
    ).toBe("0.000")
    expect(
      receberTransferenciaSchema.safeParse({
        quantidade: "6",
        idLocalDestino: 1,
      }).success,
    ).toBe(false)
  })
  it("subtrai reservas e separa saldo detalhado e saldo sem grade", () => {
    const posicao = {
      quantidade: "0.400",
      quantidade_reservada: "0.200",
      estoque_variacao: [
        { id_variacao: 1, quantidade: "0.300", quantidade_reservada: "0.200" },
      ],
    }
    expect(saldoTransferivel(posicao, 1)).toEqual({
      fisico: BigInt(300),
      reservado: BigInt(200),
      disponivel: BigInt(100),
    })
    expect(saldoTransferivel(posicao, 2).disponivel).toBe(BigInt(0))
    expect(saldoTransferivel(posicao).disponivel).toBe(BigInt(100))
  })
  it("preserva retomada sem prova da recusa e libera somente após recusa verificada", async () => {
    const descartar = vi.fn()
    for (const status of [401, 403, 409, 429, 500]) {
      await lerRespostaOperacao(
        Response.json({ error: "mal sucedida" }, { status }),
        descartar,
        "TRANSFERENCIA_RECUSADA",
      )
    }
    expect(descartar).not.toHaveBeenCalled()
    await lerRespostaOperacao(
      Response.json({ code: "TRANSFERENCIA_RECUSADA" }, { status: 409 }),
      descartar,
      "TRANSFERENCIA_RECUSADA",
    )
    expect(descartar).toHaveBeenCalledOnce()
  })
})

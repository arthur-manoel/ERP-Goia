import { describe, expect, it, vi } from "vitest"
import { lerRespostaOperacao } from "@/features/erp/resposta-operacao"

describe("tentativa idempotente após uma resposta do servidor", () => {
  it.each([
    [
      () => Response.json({ error: "Acesso negado." }, { status: 403 }),
      "Acesso negado.",
    ],
    [
      () => new Response("Forbidden", { status: 403 }),
      "Você não tem permissão para esta operação.",
    ],
  ] as const)(
    "libera outra operação após 403, inclusive ao restaurar a sessão",
    async (resposta, mensagem) => {
      const armazenamento = new Map([["tentativa", "chave-original"]])
      const retorno = await lerRespostaOperacao(resposta(), () => {
        armazenamento.delete("tentativa")
      })
      expect(retorno.error).toBe(mensagem)
      expect(armazenamento.get("tentativa")).toBeUndefined()
    },
  )

  it("mantém a chave se a resposta não comprova o resultado", async () => {
    const descartar = vi.fn()
    await lerRespostaOperacao(
      new Response("Indisponível", { status: 502 }),
      descartar,
    )
    await expect(
      lerRespostaOperacao(new Response("corpo incompleto"), descartar),
    ).rejects.toThrow()
    expect(descartar).not.toHaveBeenCalled()
  })
})

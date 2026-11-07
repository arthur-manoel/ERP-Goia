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

  it("distingue o 409 que permite repetir da recusa de negócio", async () => {
    const descartar = vi.fn()
    const temporario = Response.json(
      { code: "CONFLITO_TRANSITORIO", error: "Repita com a mesma chave." },
      { status: 409 },
    )
    expect((await lerRespostaOperacao(temporario, descartar)).error).toContain(
      "mesma chave",
    )
    expect(descartar).not.toHaveBeenCalled()

    await lerRespostaOperacao(
      Response.json({ error: "Estado inválido." }, { status: 409 }),
      descartar,
    )
    expect(descartar).toHaveBeenCalledOnce()
  })

  it("mantém a chave se a resposta não comprova o resultado", async () => {
    const descartar = vi.fn()
    await lerRespostaOperacao(
      new Response("Indisponível", { status: 502 }),
      descartar,
    )
    await lerRespostaOperacao(
      new Response("Resposta truncada", { status: 409 }),
      descartar,
    )
    await expect(
      lerRespostaOperacao(new Response("corpo incompleto"), descartar),
    ).rejects.toThrow()
    expect(descartar).not.toHaveBeenCalled()
  })

  it("libera a entrega retomada somente quando a recusa foi verificada após consultar a chave", async () => {
    const descartar = vi.fn()
    await lerRespostaOperacao(
      Response.json({ error: "Acesso negado" }, { status: 403 }),
      descartar,
      true,
    )
    await lerRespostaOperacao(
      Response.json({ error: "Chave incompatível" }, { status: 409 }),
      descartar,
      true,
    )
    expect(descartar).not.toHaveBeenCalled()
    await lerRespostaOperacao(
      Response.json(
        { error: "Reserva indisponível", code: "ENTREGA_RECUSADA" },
        { status: 409 },
      ),
      descartar,
      true,
    )
    expect(descartar).toHaveBeenCalledOnce()
  })
})

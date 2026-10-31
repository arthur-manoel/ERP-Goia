import { describe, expect, it } from "vitest"
import {
  ObservacaoForaDoLimite,
  limiteObservacaoRecebimento,
  observacaoPedidoOrigem,
  observacaoRecebimento,
} from "@/modules/compras/compras.regras"
import { receberCompraSchema } from "@/modules/compras/compras.schema"

describe("observações compostas de compras", () => {
  const codigo = "CP-000001"
  const chave = "12345678-1234-1234-1234-123456789012"

  it.each(["a", "é", "😀"])(
    "preserva %s abaixo, no limite e rejeita acima sem cortar",
    (caractere) => {
      const limite = limiteObservacaoRecebimento(codigo, chave)
      for (const tamanho of [limite - 1, limite]) {
        const obs = caractere.repeat(tamanho)
        const resultado = observacaoRecebimento(codigo, chave, obs)
        expect(resultado).toBe(
          `Recebimento da compra ${codigo}: ${obs} [rec:${chave}]`,
        )
        expect(Array.from(resultado)).toHaveLength(255 - limite + tamanho)
      }
      expect(() =>
        observacaoRecebimento(codigo, chave, caractere.repeat(limite + 1)),
      ).toThrow(`use até ${limite} caracteres`)
    },
  )

  it("conta a sequência composta sem normalizar e mantém chave completa", () => {
    const obs = "e\u0301".repeat(20)
    expect(observacaoRecebimento(codigo, chave, obs)).toBe(
      `Recebimento da compra ${codigo}: ${obs} [rec:${chave}]`,
    )
    expect(limiteObservacaoRecebimento(codigo, "x".repeat(64))).toBe(
      limiteObservacaoRecebimento(codigo, chave) - 28,
    )
  })

  it("a entrada de recebimento usa a mesma contagem Unicode do texto composto", () => {
    const limite = limiteObservacaoRecebimento(codigo, chave)
    const obs = "😀".repeat(limite)
    const parsed = receberCompraSchema.parse({ observacao: ` ${obs} ` })
    expect(parsed.observacao).toBe(obs)
    expect(
      Array.from(observacaoRecebimento(codigo, chave, parsed.observacao)),
    ).toHaveLength(255)
    expect(
      receberCompraSchema.parse({ observacao: "e\u0301".repeat(50) })
        .observacao,
    ).toBe("e\u0301".repeat(50))
    expect(
      receberCompraSchema.safeParse({ observacao: "😀".repeat(255) }).success,
    ).toBe(true)
    const acima = receberCompraSchema.safeParse({
      observacao: "😀".repeat(256),
    })
    expect(acima.success).toBe(false)
    if (!acima.success)
      expect(acima.error.issues[0].message).toBe(
        "Observação do recebimento: use até 255 caracteres.",
      )
  })

  it.each([null, undefined, ""])(
    "preserva recebimento sem observação (%s)",
    (obs) => {
      expect(receberCompraSchema.parse({ observacao: obs }).observacao).toBe(
        obs,
      )
      expect(observacaoRecebimento(codigo, chave, obs)).toBe(
        `Recebimento da compra ${codigo} [rec:${chave}]`,
      )
    },
  )

  it("mantém o trim já existente para espaços na entrada", () => {
    expect(receberCompraSchema.parse({ observacao: "   " }).observacao).toBe("")
  })

  it("mantém observação e pedido de origem completos ou rejeita excesso", () => {
    const prefixo = "Pedido de origem: PC-000001 | "
    const limite = 255 - Array.from(prefixo).length
    for (const quantidade of [limite - 1, limite]) {
      const obs = "😀".repeat(quantidade)
      expect(observacaoPedidoOrigem("PC-000001", obs)).toBe(prefixo + obs)
    }
    expect(() =>
      observacaoPedidoOrigem("PC-000001", "a".repeat(limite + 1)),
    ).toThrow(ObservacaoForaDoLimite)
    expect(observacaoPedidoOrigem("PC-000001", null)).toBe(
      "Pedido de origem: PC-000001",
    )
    expect(observacaoPedidoOrigem("PC-000001", "")).toBe(
      "Pedido de origem: PC-000001",
    )
  })
})

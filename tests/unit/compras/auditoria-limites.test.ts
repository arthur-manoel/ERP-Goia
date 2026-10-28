import { expect, it, vi } from "vitest"
import {
  auditar,
  type Contexto,
  type Transaction,
} from "../../../src/modules/compras/compras.repository"
import {
  cabeEmTextMysql,
  serializarJsonTextMysql,
} from "../../../src/lib/limites-texto"

const ctx: Contexto = {
  idUsuario: 1,
  idEmpresa: 10,
  pode: { ler: true, criar: true, editar: true, excluir: true },
}

it("mede o JSON final, inclusive escapes, e preserva o conteúdo permitido", () => {
  const valor = { observacao: 'á😀e\u0301"\\\n' }
  expect(serializarJsonTextMysql(valor, (msg) => new Error(msg))).toBe(
    JSON.stringify(valor),
  )
  const limite = { texto: "x".repeat(65_523) }
  expect(Buffer.byteLength(JSON.stringify(limite), "utf8")).toBe(65_535)
  expect(serializarJsonTextMysql(limite, (msg) => new Error(msg))).toBe(
    JSON.stringify(limite),
  )
  limite.texto += "x"
  expect(() =>
    serializarJsonTextMysql(limite, (msg) => new Error(msg)),
  ).toThrow(/65.535 bytes/)
})

it.each([false, true])(
  "rejeita snapshot de compra acima do TEXT antes de enviar SQL (anterior=%s)",
  (anterior) => {
    const create = vi.fn()
    const tx = { auditoria: { create } } as unknown as Transaction
    // Cada campo cabe no VARCHAR(255), mas a soma de 200 itens não cabe no TEXT.
    const grande = {
      itens: Array.from({ length: 200 }, () => ({
        observacao: "á".repeat(255),
      })),
    }
    expect(() =>
      auditar(
        tx,
        ctx,
        "requisicao_compra",
        1,
        anterior ? grande : null,
        anterior ? {} : grande,
      ),
    ).toThrow(
      expect.objectContaining({
        status: 400,
        message: expect.stringContaining("65.535 bytes"),
      }),
    )
    expect(create).not.toHaveBeenCalled()
  },
)

it("não confunde tamanho da string original com os escapes do JSON", () => {
  const texto = "\u0000".repeat(11_000)
  expect(cabeEmTextMysql(texto)).toBe(true)
  expect(() =>
    serializarJsonTextMysql({ texto }, (msg) => new Error(msg)),
  ).toThrow(/auditoria/)
})

it("grava snapshot permitido completo e mantém ausência do snapshot anterior", () => {
  const create = vi.fn()
  const tx = { auditoria: { create } } as unknown as Transaction
  const depois = { observacao: "Observação de compra 😀", itens: [{ id: 1 }] }
  auditar(tx, ctx, "compras", 1, null, depois)
  expect(create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      dados_anteriores: null,
      dados_novos: JSON.stringify(depois),
    }),
  })
})

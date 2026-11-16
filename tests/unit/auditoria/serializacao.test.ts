import { expect, it } from "vitest"
import { serializarJsonTextMysql } from "../../../src/lib/limites-texto"

it("serializa BigInt raiz sem converter para Number", () => {
  const valor = BigInt("9007199254740993123456789")
  expect(JSON.parse(serializarJsonTextMysql(valor, (m) => new Error(m)))).toBe(
    valor.toString(),
  )
})
it("aplica o limite TEXT ao JSON final também com BigInt", () => {
  const overhead = Buffer.byteLength(JSON.stringify({ valor: "" }))
  const limite = { valor: BigInt("9".repeat(65535 - overhead)) }
  expect(
    Buffer.byteLength(serializarJsonTextMysql(limite, (m) => new Error(m))),
  ).toBe(65535)
  const excedente = { valor: BigInt("9".repeat(65536 - overhead)) }
  expect(() => serializarJsonTextMysql(excedente, (m) => new Error(m))).toThrow(
    /65.535 bytes/,
  )
})

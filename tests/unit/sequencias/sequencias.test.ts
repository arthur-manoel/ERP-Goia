import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import {
  formatarNumero,
  proximoNumero,
  type EntidadeNumerada,
} from "@/lib/sequencias"

const tx = {
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  sequencias_automaticas: { update: vi.fn() },
}
const database = tx as unknown as Prisma.TransactionClient

beforeEach(() => {
  tx.$queryRaw
    .mockResolvedValueOnce([{ ultimo: "0" }])
    .mockResolvedValueOnce([])
  tx.sequencias_automaticas.update.mockImplementation(async ({ data }) => data)
})

it.each([
  ["pedido_cliente", "123"],
  ["ordem_producao", "123"],
  ["venda", "123"],
  ["compras", "CP-000123"],
  ["pedido_compra", "PC-000123"],
  ["requisicao_compra", "SC-000123"],
  ["nota_fiscal", "123"],
] satisfies Array<[EntidadeNumerada, string]>)(
  "preserva o formato de %s",
  (entidade, esperado) => {
    expect(formatarNumero(entidade, BigInt(123))).toBe(esperado)
  },
)

it("não corta números com mais de seis dígitos nem perde precisão de BigInt", () => {
  expect(formatarNumero("compras", BigInt("9007199254740993"))).toBe(
    "CP-9007199254740993",
  )
})

it("bloqueia a sequência antes de ler o contador e regularizar legados", async () => {
  await expect(
    proximoNumero(database, "pedido_cliente", { idEmpresa: 10 }),
  ).resolves.toBe("1")
  expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
    tx.$queryRaw.mock.invocationCallOrder[0],
  )
  expect(tx.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
    tx.sequencias_automaticas.update.mock.invocationCallOrder[0],
  )
  expect(tx.sequencias_automaticas.update).toHaveBeenCalledWith({
    where: {
      id_empresa_entidade: { id_empresa: 10, entidade: "pedido_cliente" },
    },
    data: { ultimo_numero: BigInt(1) },
    select: { ultimo_numero: true },
  })
})

it("preserva os pedidos numéricos legados acima da sequência", async () => {
  tx.$queryRaw
    .mockReset()
    .mockResolvedValueOnce([{ ultimo: "10" }])
    .mockResolvedValueOnce([{ maior: "9007199254740993" }])
  expect(
    await proximoNumero(database, "pedido_cliente", { idEmpresa: 10 }),
  ).toBe("9007199254740994")
})

it("não reduz uma sequência que já ultrapassou os documentos existentes", async () => {
  tx.$queryRaw
    .mockReset()
    .mockResolvedValueOnce([{ ultimo: "99" }])
    .mockResolvedValueOnce([{ maior: "10" }])
  expect(
    await proximoNumero(database, "ordem_producao", { idEmpresa: 10 }),
  ).toBe("100")
})

it("não escreve além do limite BIGINT UNSIGNED", async () => {
  tx.$queryRaw
    .mockReset()
    .mockResolvedValueOnce([{ ultimo: "18446744073709551615" }])
  await expect(
    proximoNumero(database, "nota_fiscal", { idEmpresa: 10 }),
  ).rejects.toMatchObject({ status: 409 })
  expect(tx.sequencias_automaticas.update).not.toHaveBeenCalled()
})

it.each([0, -1, 1.5, NaN, 2147483648])(
  "rejeita empresa inválida %s antes do SQL",
  async (idEmpresa) => {
    await expect(
      proximoNumero(database, "compras", { idEmpresa }),
    ).rejects.toMatchObject({ status: 400 })
    expect(tx.$executeRaw).not.toHaveBeenCalled()
  },
)

it("rejeita entidade desconhecida antes do SQL", async () => {
  await expect(
    proximoNumero(database, "invalida" as EntidadeNumerada, { idEmpresa: 10 }),
  ).rejects.toMatchObject({ status: 400 })
  expect(tx.$executeRaw).not.toHaveBeenCalled()
})

it("propaga conflitos para o chamador repetir a transação inteira", async () => {
  const erro = new Error("deadlock de teste")
  tx.$executeRaw.mockRejectedValueOnce(erro)
  await expect(
    proximoNumero(database, "compras", { idEmpresa: 10 }),
  ).rejects.toBe(erro)
  expect(tx.$executeRaw).toHaveBeenCalledOnce()
  expect(tx.sequencias_automaticas.update).not.toHaveBeenCalled()
})

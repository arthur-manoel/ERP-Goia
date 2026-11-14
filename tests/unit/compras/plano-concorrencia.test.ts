import { expect, it, vi } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { gravacao } from "@/modules/compras/compras.repository"
import { db } from "../../helpers/prisma"

const ctx = {
  idUsuario: 1,
  idEmpresa: 10,
  pode: { ler: true, criar: true, editar: true, excluir: true },
}
const erro = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("conflito simulado", {
    code,
    clientVersion: "7.10.0",
  })

it("repete uma vez uma transação desfeita por conflito de escrita", async () => {
  db.$transaction
    .mockRejectedValueOnce(erro("P2034"))
    .mockResolvedValueOnce("ok")
  await expect(gravacao(ctx, vi.fn(), { repetirConflito: true })).resolves.toBe(
    "ok",
  )
  expect(db.$transaction).toHaveBeenCalledTimes(2)
})

it("interrompe após um segundo conflito de escrita", async () => {
  db.$transaction
    .mockRejectedValueOnce(erro("P2034"))
    .mockRejectedValueOnce(erro("P2034"))
  await expect(
    gravacao(ctx, vi.fn(), { repetirConflito: true }),
  ).rejects.toMatchObject({ status: 409 })
  expect(db.$transaction).toHaveBeenCalledTimes(2)
})

it("não interpreta uma violação de unicidade como confirmação bem-sucedida", async () => {
  db.$transaction.mockRejectedValueOnce(erro("P2002"))
  await expect(
    gravacao(ctx, vi.fn(), { repetirConflito: true }),
  ).rejects.toMatchObject({ status: 409 })
  expect(db.$transaction).toHaveBeenCalledTimes(1)
})

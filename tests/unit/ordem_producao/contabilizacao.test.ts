import { expect, it, vi } from "vitest"
import { allowedCompanies } from "../../../modules/catalogos/repository"
import { Prisma } from "../../../src/generated/prisma/client"
import { db } from "../../helpers/prisma"
import { identidadeConfirmacao } from "../../../src/modules/producao/producao.contabilizacao"
import { conflitoPersistencia } from "../../../src/modules/producao/producao.errors"

it("permissão usa o cliente recebido, preserva filtros e não escapa para o Prisma global", async () => {
  const consulta = vi.fn().mockResolvedValue([{ id_empresa: 10 }])
  const tx = { usuario_empresa: { findMany: consulta } } as unknown as Pick<
    Prisma.TransactionClient,
    "usuario_empresa"
  >
  await expect(
    allowedCompanies(1, "ORDENS_PRODUCAO", "pode_editar", tx),
  ).resolves.toEqual([10])
  expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
  expect(consulta).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id_usuario: 1,
        status: "ATIVO",
        usuarios: { status: "ATIVO" },
        empresas: { status: "ATIVA" },
        OR: expect.arrayContaining([
          {
            permissoes_usuario: {
              some: { recurso: "ORDENS_PRODUCAO", pode_editar: true },
            },
          },
        ]),
      }),
    }),
  )
  await expect(
    allowedCompanies(
      1,
      "INVALIDO" as Parameters<typeof allowedCompanies>[1],
      "pode_editar",
      tx,
    ),
  ).resolves.toEqual([])
  await expect(
    allowedCompanies(
      1,
      "ORDENS_PRODUCAO",
      "invalido" as Parameters<typeof allowedCompanies>[2],
      tx,
    ),
  ).resolves.toEqual([])
  expect(consulta).toHaveBeenCalledTimes(1)
})
it("identidade normaliza Decimal(15,3), diferencia autor e preserva a chave explícita", () => {
  const ctx = { idEmpresa: 10, idUsuario: 1 }
  expect(identidadeConfirmacao(ctx, 1, 2, "6", "0")).toEqual(
    identidadeConfirmacao(ctx, 1, 2, "6.000", "0.000"),
  )
  expect(identidadeConfirmacao(ctx, 1, 2, "6", "0").chave).not.toBe(
    identidadeConfirmacao({ ...ctx, idUsuario: 2 }, 1, 2, "6", "0").chave,
  )
  expect(
    identidadeConfirmacao(ctx, 1, 2, "999999999999.999", "0", "comando-123")
      .chave,
  ).toBe("comando-123")
  for (const chave of ["", "curta", "espaço123", "com espaço", "x".repeat(129)])
    expect(() => identidadeConfirmacao(ctx, 1, 2, "6", "0", chave)).toThrow()
})
it("MariaDB 1020 dentro de P2039 é conflito, sem classificar schema ou falha de auditoria como disputa", () => {
  const erro = (code: string) =>
    new Prisma.PrismaClientKnownRequestError("Banco", {
      code: "P2039",
      clientVersion: "7.10.0",
      meta: {
        driverAdapterError: {
          name: "DriverAdapterError",
          cause: { originalCode: code },
        },
      },
    })
  expect(conflitoPersistencia(erro("1020"))).toBe(true)
  expect(conflitoPersistencia(erro("1644"))).toBe(false)
  expect(conflitoPersistencia(erro("1054"))).toBe(false)
})

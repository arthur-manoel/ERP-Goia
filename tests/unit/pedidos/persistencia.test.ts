import { expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import { disputaPersistencia } from "../../../src/lib/prisma-concorrencia"
import {
  gravacao,
  listar,
} from "../../../src/modules/pedidos/pedidos.repository"
import { db } from "../../helpers/prisma"
it.each(["P2002", "P2034"])("classifica conflito Prisma %s", (code) =>
  expect(
    disputaPersistencia(
      new Prisma.PrismaClientKnownRequestError("fixture", {
        code,
        clientVersion: "7.10.0",
      }),
    ),
  ).toBe(true),
)
it.each([1020, 1062, 1205, 1213])(
  "classifica código nativo %s inclusive P2039/raw",
  (code) => {
    for (const outer of ["P2039", "P2010"])
      expect(
        disputaPersistencia({
          code: outer,
          meta: {
            driverAdapterError: {
              name: "DriverAdapterError",
              cause: { kind: "mysql", code, originalCode: String(code) },
            },
          },
        }),
      ).toBe(true)
    expect(
      disputaPersistencia({
        name: "DriverAdapterError",
        cause: { kind: "mysql", code },
      }),
    ).toBe(true)
  },
)
it("não mascara erro de schema/conexão como disputa", () => {
  for (const code of [1045, 1054, 1146])
    expect(
      disputaPersistencia({
        code: "P2039",
        meta: { driverAdapterError: { cause: { kind: "mysql", code } } },
      }),
    ).toBe(false)
  expect(disputaPersistencia(new Error("unexpected"))).toBe(false)
})
it("edição perdida não repete automaticamente", async () => {
  db.$transaction.mockRejectedValue({
    code: "P2039",
    meta: {
      driverAdapterError: { cause: { kind: "mysql", originalCode: "1020" } },
    },
  })
  await expect(gravacao(vi.fn())).rejects.toMatchObject({ status: 409 })
  expect(db.$transaction).toHaveBeenCalledTimes(1)
})
it("criação idempotente pode repetir somente após rollback e limita tentativas", async () => {
  db.$transaction
    .mockRejectedValueOnce({ code: "P2034" })
    .mockResolvedValueOnce("ok")
  expect(await gravacao(vi.fn(), true)).toBe("ok")
  db.$transaction.mockReset().mockRejectedValue({ code: "P2034" })
  await expect(gravacao(vi.fn(), true)).rejects.toMatchObject({ status: 409 })
  expect(db.$transaction).toHaveBeenCalledTimes(5)
})
it("conta e pagina no banco com filtro de empresa/cliente e ordenação determinística", async () => {
  db.pedido_cliente.count.mockResolvedValue(101)
  db.pedido_cliente.findMany.mockResolvedValue([])
  const result = await listar(
    db as unknown as Prisma.TransactionClient,
    { idEmpresa: 10, idUsuario: 1 },
    { pagina: 2, limite: 25, idCliente: 12, status: "RASCUNHO" },
  )
  expect(result.paginacao.totalRegistros).toBe(101)
  expect(db.pedido_cliente.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id_empresa: 10,
        id_cliente: 12,
        clientes: { id_empresa: 10 },
      }),
      skip: 25,
      take: 25,
      orderBy: [{ data_pedido: "desc" }, { id: "desc" }],
    }),
  )
})

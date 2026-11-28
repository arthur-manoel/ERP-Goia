import { expect, it, vi } from "vitest"
import type { Prisma } from "@/generated/prisma/client"
import { decidir } from "@/modules/cancelamentos/cancelamentos.service"
import { editarUsuario } from "@/modules/usuarios/usuarios.repository"

it("bloqueia autoaprovação inclusive para administrador", async () => {
  const update = vi.fn()
  const tx = {
    usuario_empresa: {
      findFirst: vi.fn().mockResolvedValue({
        nivel_acesso: "EMPRESA",
        usuarios: { nivel_acesso: "USUARIO" },
        cargos: { id_empresa: 10, status: "ATIVO" },
        permissoes_usuario: [],
      }),
    },
    pedido_cancelamento: {
      findFirst: vi.fn().mockResolvedValue({
        id_solicitante: 1,
        status: "AGUARDANDO_APROVACAO",
      }),
      update,
    },
  } as unknown as Prisma.TransactionClient
  await expect(
    decidir(tx, { idEmpresa: 10, idUsuario: 1 }, 3, "APROVADA", "Teste"),
  ).rejects.toMatchObject({ status: 403 })
  expect(update).not.toHaveBeenCalled()
})

it("reativação de vínculo exige cargo ativo da mesma empresa", async () => {
  const update = vi.fn()
  const tx = {
    usuarios: {
      findFirst: vi.fn().mockResolvedValue({
        status: "ATIVO",
        usuario_empresa: [{ id: 3, id_cargo: 5 }],
      }),
    },
    usuario_empresa: { update },
    cargos: { findFirst: vi.fn().mockResolvedValue(null) },
  } as unknown as Prisma.TransactionClient
  await expect(
    editarUsuario(tx, { idEmpresa: 10, idUsuario: 1 }, 2, {
      statusVinculo: "ATIVO",
    }),
  ).rejects.toMatchObject({ status: 404 })
  expect(tx.cargos.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 5, id_empresa: 10, status: "ATIVO" },
    }),
  )
  expect(update).not.toHaveBeenCalled()
})

it("impede remover o último vínculo administrativo junto da transferência", async () => {
  const update = vi.fn()
  const tx = {
    usuarios: {
      findFirst: vi.fn().mockResolvedValue({
        status: "ATIVO",
        usuario_empresa: [
          {
            id: 3,
            id_cargo: 5,
            status: "ATIVO",
            nivel_acesso: "EMPRESA",
            cargos: { status: "ATIVO" },
            usuarios: { nivel_acesso: "USUARIO" },
          },
        ],
      }),
    },
    usuario_empresa: { findFirst: vi.fn().mockResolvedValue(null), update },
  } as unknown as Prisma.TransactionClient
  await expect(
    editarUsuario(tx, { idEmpresa: 10, idUsuario: 1 }, 2, {
      idCargo: 6,
      statusVinculo: "INATIVO",
    }),
  ).rejects.toMatchObject({ status: 409 })
  expect(update).not.toHaveBeenCalled()
})

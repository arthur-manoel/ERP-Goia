import { beforeEach, expect, it } from "vitest"
import { db } from "../../helpers/prisma"
import {
  autorizar,
  type Acao,
} from "../../../src/modules/pedidos/pedidos.authorization"

const request = (empresa: string | null = "10", token = "test-token") =>
  new Request("http://localhost/api/pedidos", {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(empresa === null ? {} : { "X-Empresa-Id": empresa }),
    },
  })
function vinculo(flags = {}, admin = false) {
  return {
    id_empresa: 10,
    nivel_acesso: "USUARIO",
    usuarios: { nivel_acesso: admin ? "ADMIN" : "USUARIO" },
    permissoes_usuario: [
      { recurso: "PEDIDOS", ...flags },
      {
        recurso: "CLIENTES",
        pode_ler: true,
        pode_criar: true,
        pode_editar: true,
        pode_excluir: true,
      },
    ],
  }
}
beforeEach(() => db.usuario_empresa.findMany.mockResolvedValue([vinculo()]))
it.each(["ler", "criar", "editar", "excluir"] as const)(
  "outras permissões não concedem %s",
  async (acao) => {
    await expect(autorizar(request(), acao)).rejects.toMatchObject({
      status: 403,
    })
  },
)
it.each(["ler", "criar", "editar"] as const)(
  "permissão comercial independente: %s",
  async (acao) => {
    db.usuario_empresa.findMany.mockResolvedValue([
      vinculo({ [`pode_${acao}`]: true }),
    ])
    expect(await autorizar(request(), acao)).toEqual({
      idEmpresa: 10,
      idUsuario: 1,
    })
    for (const outra of ["ler", "criar", "editar"] as const)
      if (outra !== acao)
        await expect(autorizar(request(), outra)).rejects.toMatchObject({
          status: 403,
        })
  },
)
it("remover item exige editar e excluir", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    vinculo({ pode_excluir: true }),
  ])
  await expect(autorizar(request(), "excluir")).rejects.toMatchObject({
    status: 403,
  })
  db.usuario_empresa.findMany.mockResolvedValue([
    vinculo({ pode_editar: true, pode_excluir: true }),
  ])
  expect(await autorizar(request(), "excluir")).toEqual({
    idEmpresa: 10,
    idUsuario: 1,
  })
})
it("administrador ainda precisa de vínculo ativo", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([vinculo({}, true)])
  expect(await autorizar(request(), "criar")).toEqual({
    idEmpresa: 10,
    idUsuario: 1,
  })
  db.usuario_empresa.findMany.mockResolvedValue([])
  await expect(autorizar(request(), "criar")).rejects.toMatchObject({
    status: 403,
  })
})
it.each(["20", "0", "01", "1.0", "2147483648", "__proto__"])(
  "header não concede empresa: %s",
  async (empresa) =>
    await expect(autorizar(request(empresa), "ler")).rejects.toMatchObject({
      status: 403,
    }),
)
it("revalida usuário, empresa e vínculo no banco", async () => {
  await expect(autorizar(request(), "ler")).rejects.toMatchObject({
    status: 403,
  })
  expect(db.usuario_empresa.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id_usuario: 1,
        status: "ATIVO",
        usuarios: { status: "ATIVO" },
        empresas: { status: "ATIVA" },
      },
    }),
  )
})
it("uma empresa permite seleção implícita; múltiplas exigem header", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([vinculo({ pode_ler: true })])
  expect(await autorizar(request(null), "ler")).toEqual({
    idEmpresa: 10,
    idUsuario: 1,
  })
  db.usuario_empresa.findMany.mockResolvedValue([
    vinculo(),
    { ...vinculo(), id_empresa: 20 },
  ])
  await expect(autorizar(request(null), "ler")).rejects.toMatchObject({
    status: 400,
  })
})
it.each(["", "invalido"])("rejeita JWT ausente ou inválido", async (token) => {
  const resposta = await autorizar(request("10", token), "ler")
  expect(resposta).toBeInstanceOf(Response)
  expect((resposta as Response).status).toBe(401)
})
it("ação desconhecida nunca concede acesso, inclusive para admin", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([vinculo({}, true)])
  for (const acao of ["__proto__", "constructor", "qualquer"])
    await expect(autorizar(request(), acao as Acao)).rejects.toMatchObject({
      status: 403,
    })
})

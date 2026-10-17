import { beforeEach, expect, it, vi } from "vitest"
import { db } from "../../helpers/prisma"
import {
  autorizarConsulta,
  autorizarFechamento,
} from "../../../src/modules/pedido-recebiveis/recebiveis.authorization"

const tokens = vi.hoisted(() => ({
  role: "ADMINISTRACAO",
  id: 1 as number | string,
}))
vi.mock("../../../src/lib/jwt", () => ({
  verifyAccessToken: (token: string) =>
    token === "test-token" ? { id: tokens.id, role: tokens.role } : null,
}))

const request = (empresa: string | null = "10", token = "test-token") =>
  new Request("http://localhost/api/pedidos/1/conta-a-receber", {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(empresa === null ? {} : { "X-Empresa-Id": empresa }),
    },
  })
function vinculo(
  financeiro = false,
  pedidos = false,
  nivelUsuario = "USUARIO",
  nivelEmpresa = "USUARIO",
) {
  return {
    id_empresa: 10,
    nivel_acesso: nivelEmpresa,
    usuarios: { nivel_acesso: nivelUsuario },
    permissoes_usuario: [
      {
        recurso: "FINANCEIRO",
        pode_ler: financeiro,
        pode_criar: true,
        pode_editar: true,
        pode_excluir: true,
      },
      { recurso: "PEDIDOS", pode_ler: true, pode_editar: pedidos },
      {
        recurso: "CLIENTES",
        pode_ler: true,
        pode_criar: true,
        pode_editar: true,
      },
      { recurso: "ESTOQUE", pode_ler: true },
    ],
  }
}
beforeEach(() => {
  tokens.role = "ADMINISTRACAO"
  tokens.id = 1
  db.usuario_empresa.findMany.mockResolvedValue([vinculo()])
})
it("vendedor pode fechar com PEDIDOS editar sem receber leitura financeira", async () => {
  tokens.role = "VENDAS"
  db.usuario_empresa.findMany.mockResolvedValue([vinculo(false, true)])
  expect(await autorizarFechamento(request())).toEqual({
    idEmpresa: 10,
    idUsuario: 1,
  })
  expect(((await autorizarConsulta(request())) as Response).status).toBe(403)
})
it("perfil financeiro exige a permissão específica e não fecha por ter FINANCEIRO", async () => {
  tokens.role = "FINANCEIRO"
  db.usuario_empresa.findMany.mockResolvedValue([vinculo(true, true)])
  expect(await autorizarConsulta(request())).toEqual({
    idEmpresa: 10,
    idUsuario: 1,
  })
  expect(((await autorizarFechamento(request())) as Response).status).toBe(403)
  db.usuario_empresa.findMany.mockResolvedValue([vinculo(false, true)])
  await expect(autorizarConsulta(request())).rejects.toMatchObject({
    status: 403,
  })
})
it("permissões de pedidos, clientes e estoque não autorizam a consulta financeira", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([vinculo(false, true)])
  await expect(autorizarConsulta(request())).rejects.toMatchObject({
    status: 403,
  })
})
it("FINANCEIRO ler não concede edição comercial", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([vinculo(true)])
  expect(await autorizarConsulta(request())).toEqual({
    idEmpresa: 10,
    idUsuario: 1,
  })
  await expect(autorizarFechamento(request())).rejects.toMatchObject({
    status: 403,
  })
})
it("revalida usuário, empresa e vínculo ativos no banco", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([vinculo(true)])
  await autorizarConsulta(request())
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
  db.usuario_empresa.findMany.mockResolvedValue([])
  await expect(autorizarConsulta(request())).rejects.toMatchObject({
    status: 403,
  })
})
it.each([
  ["ADMIN", "USUARIO"],
  ["USUARIO", "EMPRESA"],
])(
  "exceção administrativa %s/%s ainda exige vínculo ativo",
  async (usuario, empresa) => {
    db.usuario_empresa.findMany.mockResolvedValue([
      vinculo(false, false, usuario, empresa),
    ])
    expect(await autorizarConsulta(request())).toEqual({
      idEmpresa: 10,
      idUsuario: 1,
    })
    db.usuario_empresa.findMany.mockResolvedValue([])
    await expect(autorizarConsulta(request())).rejects.toMatchObject({
      status: 403,
    })
  },
)
it.each(["20", "0", "01", "1.0", "2147483648", "__proto__"])(
  "header não concede empresa: %s",
  async (empresa) => {
    db.usuario_empresa.findMany.mockResolvedValue([vinculo(true)])
    await expect(autorizarConsulta(request(empresa))).rejects.toMatchObject({
      status: 403,
    })
  },
)
it("uma empresa permite omissão, múltiplas exigem seleção autorizada", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([vinculo(true)])
  expect(await autorizarConsulta(request(null))).toEqual({
    idEmpresa: 10,
    idUsuario: 1,
  })
  db.usuario_empresa.findMany.mockResolvedValue([
    vinculo(true),
    { ...vinculo(true), id_empresa: 20 },
  ])
  await expect(autorizarConsulta(request(null))).rejects.toMatchObject({
    status: 400,
  })
  expect(await autorizarConsulta(request("20"))).toEqual({
    idEmpresa: 20,
    idUsuario: 1,
  })
})
it.each(["", "invalido"])(
  "rejeita JWT ausente ou inválido %s",
  async (token) => {
    expect(
      ((await autorizarConsulta(request("10", token))) as Response).status,
    ).toBe(401)
  },
)
it.each(["0", "2147483648", "1.5", "NaN"])(
  "rejeita identificação JWT inválida %s",
  async (id) => {
    tokens.id = id
    await expect(autorizarConsulta(request())).rejects.toMatchObject({
      status: 401,
    })
  },
)
it("perfil produção não consulta nem fecha", async () => {
  tokens.role = "PRODUCAO"
  db.usuario_empresa.findMany.mockResolvedValue([vinculo(true, true)])
  expect(((await autorizarConsulta(request())) as Response).status).toBe(403)
  expect(((await autorizarFechamento(request())) as Response).status).toBe(403)
  expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
})

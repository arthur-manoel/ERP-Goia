import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { db } from "../../helpers/prisma"
import { autorizarEstoque } from "../../../src/modules/estoque-minimo/estoque-minimo.authorization"
import { signAccessToken } from "../../../src/modules/auth/auth.service"

vi.mock("server-only", () => ({}))
// Esta suíte valida JWTs reais, não o token simulado do setup global.
vi.unmock("../../../src/lib/jwt")
const vinculo = (flags = {}, nivel = "USUARIO", global = "USUARIO") => ({
  id_empresa: 10,
  nivel_acesso: nivel,
  empresas: { razao_social: "Empresa" },
  usuarios: {
    nome: "Usuário",
    email: "user@example.test",
    nivel_acesso: global,
  },
  permissoes_usuario: [
    { pode_ler: false, pode_criar: false, pode_editar: false, ...flags },
  ],
})
const request = (empresa = "10") =>
  new Request("http://localhost/api/estoque", {
    headers: {
      Authorization: `Bearer ${signAccessToken({ id: 1, role: "PRODUCAO" })}`,
      "X-Empresa-Id": empresa,
    },
  })
beforeEach(() => {
  vi.stubEnv("ACCESS_TOKEN_SECRET", "unit-test-estoque-only")
})
afterEach(() => {
  vi.unstubAllEnvs()
})

it.each([
  ["ler", "pode_ler"],
  ["criar", "pode_criar"],
  ["editar", "pode_editar"],
] as const)("%s usa só a permissão %s", async (permitida, flag) => {
  db.usuario_empresa.findMany.mockResolvedValue([vinculo({ [flag]: true })])
  for (const acao of ["ler", "criar", "editar"] as const) {
    if (acao === permitida)
      expect(await autorizarEstoque(request(), acao)).toMatchObject({
        idUsuario: 1,
        idEmpresa: 10,
      })
    else
      await expect(autorizarEstoque(request(), acao)).rejects.toMatchObject({
        status: 403,
      })
  }
  expect(db.usuario_empresa.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id_usuario: 1,
        status: "ATIVO",
        empresas: { status: "ATIVA" },
        usuarios: { status: "ATIVO" },
      },
    }),
  )
})

it.each(["desconhecida", "__proto__", "constructor"])(
  "ação %s é negada mesmo ao administrador",
  async (acao) => {
    db.usuario_empresa.findMany.mockResolvedValue([
      vinculo({}, "EMPRESA", "ADMIN"),
    ])
    await expect(
      autorizarEstoque(request(), acao as never),
    ).rejects.toMatchObject({ status: 403 })
  },
)

it.each([
  ["EMPRESA", "USUARIO"],
  ["USUARIO", "ADMIN"],
])("mantém exceção %s/%s e exige vínculo ativo", async (nivel, global) => {
  db.usuario_empresa.findMany.mockResolvedValue([vinculo({}, nivel, global)])
  for (const acao of ["ler", "criar", "editar"] as const)
    expect(await autorizarEstoque(request(), acao)).toMatchObject({
      idEmpresa: 10,
    })
  db.usuario_empresa.findMany.mockResolvedValue([])
  await expect(autorizarEstoque(request(), "criar")).rejects.toMatchObject({
    status: 403,
  })
})

it("header não concede acesso e token ausente não consulta o banco", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([vinculo({ pode_criar: true })])
  await expect(autorizarEstoque(request("20"), "criar")).rejects.toMatchObject({
    status: 403,
  })
  db.usuario_empresa.findMany.mockClear()
  const result = await autorizarEstoque(
    new Request("http://localhost/api/estoque"),
    "criar",
  )
  expect(result).toBeInstanceOf(Response)
  expect((result as Response).status).toBe(401)
  expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
})

it.each(["test-token", "token-invalido"])(
  "token %s não autentica nem consulta o banco",
  async (token) => {
    const result = await autorizarEstoque(
      new Request("http://localhost/api/estoque", {
        headers: { Authorization: `Bearer ${token}`, "X-Empresa-Id": "10" },
      }),
      "criar",
    )
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
    expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
  },
)

it("JWT assinado com outra chave não autentica nem consulta o banco", async () => {
  vi.stubEnv("ACCESS_TOKEN_SECRET", "unit-test-outra-chave")
  const req = request()
  vi.stubEnv("ACCESS_TOKEN_SECRET", "unit-test-estoque-only")

  const result = await autorizarEstoque(req, "criar")
  expect(result).toBeInstanceOf(Response)
  expect((result as Response).status).toBe(401)
  expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
})

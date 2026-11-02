import { expect, it, vi } from "vitest"
import { GET } from "@/app/api/auth/empresas/route"
import { db } from "../../helpers/prisma"

vi.mock("@/lib/jwt", () => ({
  verifyAccessToken: (token: string) =>
    (
      ({
        vendas: { id: 1, role: "VENDAS" },
        financeiro: { id: 2, role: "FINANCEIRO" },
        estoque: { id: 3, role: "PRODUCAO" },
        admin: { id: 4, role: "ADMINISTRACAO" },
      }) as Record<string, { id: number; role: string }>
    )[token] ?? null,
}))
const req = (
  token = "vendas",
  query = "",
  headers: Record<string, string> = {},
) =>
  new Request("http://localhost/api/auth/empresas" + query, {
    headers: { Authorization: `Bearer ${token}`, ...headers },
  })
const usuario = (
  id = 1,
  links = [{ id_empresa: 10, empresas: { razao_social: "Empresa" } }],
) => ({
  id,
  nome: "Pessoa",
  email: `pessoa${id}@example.test`,
  usuario_empresa: links,
  senha: "nunca-expor",
  nivel_acesso: "ADMIN",
})
it.each(["", "invalido", "expirado"])(
  "%s não autentica e não consulta banco",
  async (token) => {
    const r = await GET(req(token))
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({
      success: false,
      error: "Não autenticado.",
    })
    expect(db.usuarios.findFirst).not.toHaveBeenCalled()
  },
)
it.each([
  ["vendas", 1],
  ["financeiro", 2],
  ["estoque", 3],
  ["admin", 4],
] as const)(
  "%s lista somente vínculos, sem exigir empresa ou permissão",
  async (token, id) => {
    db.usuarios.findFirst.mockResolvedValue(usuario(id))
    const r = await GET(req(token))
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      success: true,
      data: {
        usuario: { id, nome: "Pessoa", email: `pessoa${id}@example.test` },
        empresas: [{ id: 10, nome: "Empresa" }],
      },
    })
    expect(r.headers.get("Cache-Control")).toBe("private, no-store")
    expect(r.headers.get("Vary")).toBe("Authorization")
    expect(db.usuarios.findFirst).toHaveBeenCalledWith({
      where: { id, status: "ATIVO" },
      select: {
        id: true,
        nome: true,
        email: true,
        usuario_empresa: {
          where: { status: "ATIVO", empresas: { status: "ATIVA" } },
          select: {
            id_empresa: true,
            empresas: { select: { razao_social: true } },
          },
          orderBy: { id_empresa: "asc" },
        },
      },
    })
    expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
  },
)
it("usuário ativo sem vínculos recebe 200 com lista vazia", async () => {
  db.usuarios.findFirst.mockResolvedValue(usuario(1, []))
  const r = await GET(req())
  expect(r.status).toBe(200)
  expect((await r.json()).data.empresas).toEqual([])
})
it("usuário inativo ou removido não mantém acesso por JWT antigo", async () => {
  db.usuarios.findFirst.mockResolvedValue(null)
  expect((await GET(req())).status).toBe(401)
})
it("falha de infraestrutura retorna 500, não lista vazia", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.usuarios.findFirst.mockRejectedValue(new Error("conexão indisponível"))
  const r = await GET(req())
  expect(r.status).toBe(500)
  expect(await r.json()).toEqual({
    success: false,
    error: "Erro interno do servidor.",
  })
  expect(r.headers.get("Cache-Control")).toBe("private, no-store")
})
it("query de outro usuário é rejeitada e header de empresa não altera identidade", async () => {
  expect((await GET(req("vendas", "?id_usuario=99"))).status).toBe(400)
  expect(db.usuarios.findFirst).not.toHaveBeenCalled()
  db.usuarios.findFirst.mockResolvedValue(usuario())
  await GET(req("vendas", "", { "X-Empresa-Id": "999", "X-Usuario-Id": "99" }))
  expect(db.usuarios.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 1, status: "ATIVO" } }),
  )
})
it("DTO sem duplicatas e sem dados internos; cada requisição relê sua identidade", async () => {
  const vinculo = { id_empresa: 10, empresas: { razao_social: "Empresa" } }
  db.usuarios.findFirst
    .mockResolvedValueOnce(usuario(1, [vinculo, vinculo]))
    .mockResolvedValueOnce(
      usuario(2, [{ id_empresa: 20, empresas: { razao_social: "Outra" } }]),
    )
  expect((await (await GET(req())).json()).data.empresas).toEqual([
    { id: 10, nome: "Empresa" },
  ])
  expect((await (await GET(req("financeiro"))).json()).data.empresas).toEqual([
    { id: 20, nome: "Outra" },
  ])
})

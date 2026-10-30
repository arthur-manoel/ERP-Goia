import { expect, it } from "vitest"
import { GET } from "../../../src/app/api/auth/contexto/route"
import { db } from "../../helpers/prisma"
import { request } from "../../helpers/http"

it("exige Bearer antes de consultar os vínculos", async () => {
  const req = await request("/api/auth/contexto")
  req.headers.delete("Authorization")
  expect((await GET(req)).status).toBe(401)
  expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
})

it("retorna vínculos ativos sem exigir permissão de estoque e sem dados sensíveis", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    {
      id_empresa: 10,
      usuarios: { nome: "Ana", email: "ana@example.com" },
      empresas: { razao_social: "Empresa" },
    },
  ])
  const response = await GET(await request("/api/auth/contexto"))
  expect(response.status).toBe(200)
  expect(response.headers.get("Cache-Control")).toBe("no-store")
  expect(await response.json()).toEqual({
    success: true,
    data: {
      usuario: { nome: "Ana", email: "ana@example.com" },
      empresas: [{ id: 10, nome: "Empresa" }],
    },
  })
  expect(db.usuario_empresa.findMany).toHaveBeenCalledWith({
    where: {
      id_usuario: 1,
      status: "ATIVO",
      usuarios: { status: "ATIVO" },
      empresas: { status: "ATIVA" },
    },
    select: {
      id_empresa: true,
      empresas: { select: { razao_social: true } },
      usuarios: { select: { nome: true, email: true } },
    },
    orderBy: { id_empresa: "asc" },
  })
})

it("nega contexto sem vínculos ativos", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([])
  expect((await GET(await request("/api/auth/contexto"))).status).toBe(403)
})

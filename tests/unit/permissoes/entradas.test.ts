/// <reference types="vite/client" />
import { expect, it } from "vitest"
import { db } from "../../helpers/prisma"

type Entrada = (
  request: Request,
  context: {
    params: Promise<{ id: string; idItem: string; idApontamento: string }>
  },
) => Promise<Response>
const routes = import.meta.glob("../../../src/app/api/**/route.ts", {
  eager: true,
}) as Record<string, Record<string, Entrada>>
const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"]
for (const [file, exports] of Object.entries(routes)) {
  if (file.includes("/api/auth/")) continue // Cobertas pela suíte de autenticação; não exigem recurso de módulo.
  for (const method of methods.filter(
    (name) => typeof exports[name] === "function",
  )) {
    const path = file.split("/api/")[1].replace("/route.ts", "")
    it(`${method} /api/${path}: autentica e nega ausência de vínculo/permissão`, async () => {
      const context = {
        params: Promise.resolve({ id: "1", idItem: "1", idApontamento: "1" }),
      }
      const make = (authorization?: string) =>
        new Request("http://localhost/api/" + path, {
          method,
          headers: {
            ...(authorization ? { Authorization: authorization } : {}),
            "Content-Type": "application/json",
            "X-Empresa-Id": "10",
          },
          ...(method === "GET" ? {} : { body: "{}" }),
        })
      expect((await exports[method](make(), context)).status).toBe(401)
      expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
      db.usuario_empresa.findMany.mockResolvedValue([])
      const resposta = await exports[method](make("Bearer test-token"), context)
      if (path === "estoque-minimo/empresas") {
        expect(resposta.status).toBe(200)
        expect(await resposta.json()).toEqual({ usuario: null, empresas: [] })
      } else expect(resposta.status).toBe(403)
      for (const model of [
        db.produtos,
        db.clientes,
        db.estoque,
        db.fornecedores,
        db.pedido_cliente,
        db.contas_receber,
        db.compras,
      ]) {
        expect(model.findMany).not.toHaveBeenCalled()
        expect(model.create).not.toHaveBeenCalled()
        expect(model.update).not.toHaveBeenCalled()
      }
    })
  }
}
it("inventário inclui APIs atuais e as três entradas de apontamento", () => {
  const paths = Object.keys(routes)
  expect(paths.length).toBeGreaterThan(60)
  expect(
    paths.filter(
      (path) =>
        path.includes("/apontamentos/") ||
        path.endsWith("/apontamentos/route.ts"),
    ),
  ).toHaveLength(3)
})

import { describe, expect, it } from "vitest"
import * as cores from "../../../src/app/api/cores/route"
import * as core from "../../../src/app/api/cores/[id]/route"
import * as tamanhos from "../../../src/app/api/tamanhos/route"
import * as tamanho from "../../../src/app/api/tamanhos/[id]/route"
import * as produtos from "../../../src/app/api/produtos/route"
import * as produto from "../../../src/app/api/produtos/[id]/route"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"

for (const [name, collection, item, resource] of [
  ["cores", cores, core, "CORES"],
  ["tamanhos", tamanhos, tamanho, "PRODUTOS"],
  ["produtos", produtos, produto, "PRODUTOS"],
] as const) {
  describe(name + ": autorização", () => {
    const operations = [
      ["GET", (req: Request) => collection.GET(req), "pode_ler"],
      ["POST", (req: Request) => collection.POST(req), "pode_criar"],
      ["GET", (req: Request) => item.GET(req, context()), "pode_ler"],
      ["PUT", (req: Request) => item.PUT(req, context()), "pode_editar"],
      ["PATCH", (req: Request) => item.PATCH(req, context()), "pode_editar"],
      ["DELETE", (req: Request) => item.DELETE(req, context()), "pode_excluir"],
    ] as const
    for (const [method, invoke, permission] of operations) {
      it(
        method + " rejeita token ausente/inválido antes de acessar banco",
        async () => {
          for (const authorization of [null, "Bearer invalid-token"]) {
            const req = await request("/api/" + name, method)
            if (authorization) req.headers.set("Authorization", authorization)
            else req.headers.delete("Authorization")
            const res = await invoke(req)
            expect(res.status).toBe(401)
            expect(await res.json()).toEqual({
              success: false,
              error: "Não autenticado.",
            })
          }
          expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
          expect(db[name].findMany).not.toHaveBeenCalled()
          expect(db[name].update).not.toHaveBeenCalled()
        },
      )
      it(method + " exige vínculo e permissão " + permission, async () => {
        db.usuario_empresa.findMany.mockResolvedValue([])
        expect(
          (await invoke(await request("/api/" + name, method))).status,
        ).toBe(403)
        expect(db.usuario_empresa.findMany).toHaveBeenCalledWith({
          where: {
            id_usuario: 1,
            status: "ATIVO",
            usuarios: { status: "ATIVO" },
            empresas: { status: "ATIVA" },
            permissoes_usuario: {
              some: { recurso: resource, [permission]: true },
            },
          },
          select: { id_empresa: true },
        })
        expect(db[name].create).not.toHaveBeenCalled()
        expect(db[name].update).not.toHaveBeenCalled()
      })
    }
    it("bloqueia filtro de outra empresa", async () => {
      expect(
        (await collection.GET(await request("/api/" + name + "?id_empresa=99")))
          .status,
      ).toBe(403)
      expect(db[name].findMany).not.toHaveBeenCalled()
    })
    it("PATCH salva parcialmente dentro do escopo", async () => {
      db[name].update.mockResolvedValue({ id: 1, nome: "Novo" })
      expect(
        (
          await item.PATCH(
            await request("/api/" + name + "/1", "PATCH", { nome: "Novo" }),
            context(),
          )
        ).status,
      ).toBe(200)
      const where =
        name === "produtos"
          ? {
              id: 1,
              produto_empresa: {
                some: { id_empresa: { in: [10] } },
                every: { id_empresa: { in: [10] } },
              },
            }
          : { id: 1, id_empresa: { in: [10] } }
      expect(db[name].update).toHaveBeenCalledWith({
        where,
        data: { nome: "Novo" },
      })
    })
    it("consulta ID dentro do escopo e retorna 404 para inacessível", async () => {
      db[name].findFirst.mockResolvedValue(null)
      expect(
        (await item.GET(await request("/api/" + name + "/1"), context()))
          .status,
      ).toBe(404)
      expect(db[name].findFirst).toHaveBeenCalledWith({
        where:
          name === "produtos"
            ? { id: 1, produto_empresa: { some: { id_empresa: { in: [10] } } } }
            : { id: 1, id_empresa: { in: [10] } },
      })
    })
  })
}
for (const [name, collection, item, field, status] of [
  ["cores", cores, core, "codigo_hex", "ATIVA"],
  ["tamanhos", tamanhos, tamanho, "descricao", "ATIVO"],
] as const) {
  it(
    name + ": busca OR no banco, paginação e contagem com mesmo escopo",
    async () => {
      db[name].findMany.mockResolvedValue([{ id: 11 }])
      db[name].count.mockResolvedValue(120)
      const response = await collection.GET(
        await request(
          "/api/" + name + "?page=2&limit=10&busca=azul&status=" + status,
        ),
      )
      expect(response.status).toBe(200)
      expect((await response.json()).data).toEqual({
        rows: [{ id: 11 }],
        count: 120,
        totalPages: 12,
        page: 2,
        limit: 10,
      })
      const where = {
        AND: [{ status }, { id_empresa: { in: [10] } }],
        OR: [{ nome: { contains: "azul" } }, { [field]: { contains: "azul" } }],
      }
      expect(db[name].findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, skip: 10, take: 10 }),
      )
      expect(db[name].count).toHaveBeenCalledWith({ where })
      expect(db[name].findMany).toHaveBeenCalledTimes(1)
    },
  )
  it(name + ": não transfere nem cria em empresa sem permissão", async () => {
    expect(
      (
        await item.PATCH(
          await request("/api/" + name + "/1", "PATCH", { id_empresa: 99 }),
          context(),
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await collection.POST(
          await request("/api/" + name, "POST", {
            id_empresa: 99,
            nome: "Novo",
          }),
        )
      ).status,
    ).toBe(403)
    expect(db[name].create).not.toHaveBeenCalled()
    expect(db[name].update).not.toHaveBeenCalled()
  })
}
it("produto criado já possui vínculo atômico com a empresa autorizada", async () => {
  db.produtos.findFirst.mockResolvedValue(null)
  db.produtos.create.mockResolvedValue({ id: 1 })
  const body = {
    id_empresa: 10,
    codigo: "P1",
    nome: "Produto",
    id_tipo_produto: 1,
    unidade: "UN",
    controla_estoque: 1,
    permite_compra: 1,
    permite_producao: 0,
    permite_venda: 1,
  }
  expect(
    (await produtos.POST(await request("/api/produtos", "POST", body))).status,
  ).toBe(201)
  expect(db.produtos.create).toHaveBeenCalledWith({
    data: {
      codigo: "P1",
      nome: "Produto",
      id_tipo_produto: 1,
      unidade: "UN",
      controla_estoque: true,
      permite_compra: true,
      permite_producao: false,
      permite_venda: true,
      status: "ATIVO",
      produto_empresa: { create: { id_empresa: 10, codigo_interno: "P1" } },
    },
  })
  db.produtos.create.mockClear()
  expect(
    (
      await produtos.POST(
        await request("/api/produtos", "POST", { ...body, id_empresa: 99 }),
      )
    ).status,
  ).toBe(403)
  expect(db.produtos.create).not.toHaveBeenCalled()
})

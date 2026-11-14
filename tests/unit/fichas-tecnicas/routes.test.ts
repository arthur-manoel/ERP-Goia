import { beforeEach, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { GET, PUT } from "../../../src/app/api/fichas-tecnicas/ativa/route"
import { db } from "../../helpers/prisma"
import { request } from "../../helpers/http"

const input = {
  id_produto: 12,
  id_ficha_esperada: null as number | null,
  itens: [{ id_produto_componente: 7, quantidade: "2.000" }],
}
const ficha = {
  id: 44,
  id_empresa: 10,
  id_produto: 12,
  versao: 1,
  status: "ATIVA",
  data_vigencia: new Date("2026-01-01T00:00:00Z"),
  ficha_tecnica_item: [
    {
      id_produto_componente: 7,
      quantidade: new Prisma.Decimal("2"),
      perda_percentual: new Prisma.Decimal("0"),
    },
  ],
}
async function chamar(
  method: "GET" | "PUT",
  body: unknown = input,
  empresa: string | null = "10",
  token: string | null = "test-token",
) {
  const req = await request(
    "/api/fichas-tecnicas/ativa" + (method === "GET" ? "?id_produto=12" : ""),
    method,
    method === "PUT" ? body : undefined,
  )
  if (empresa !== null) req.headers.set("X-Empresa-Id", empresa)
  if (token === null) req.headers.delete("Authorization")
  else req.headers.set("Authorization", `Bearer ${token}`)
  return method === "GET" ? GET(req) : PUT(req)
}

beforeEach(() => {
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.produto_empresa.findFirst.mockResolvedValue({ id_produto: 12 })
  db.produto_empresa.count.mockResolvedValue(1)
  db.ficha_tecnica.findFirst.mockResolvedValue(null)
  db.ficha_tecnica.aggregate.mockResolvedValue({ _max: { versao: null } })
  db.ficha_tecnica.create.mockResolvedValue(ficha)
})

it.each(["GET", "PUT"] as const)(
  "%s exige autenticação e vínculo/permissão",
  async (method) => {
    expect((await chamar(method, input, "10", null)).status).toBe(401)
    expect((await chamar(method, input, "10", "invalid-token")).status).toBe(
      401,
    )
    expect(db.produto_empresa.findFirst).not.toHaveBeenCalled()
    db.usuario_empresa.findMany.mockResolvedValue([])
    expect((await chamar(method)).status).toBe(403)
  },
)

it.each(["GET", "PUT"] as const)(
  "%s exige empresa ativa autorizada",
  async (method) => {
    expect((await chamar(method, input, null)).status).toBe(400)
    expect((await chamar(method, input, "20")).status).toBe(403)
    expect(db.produto_empresa.findFirst).not.toHaveBeenCalled()
  },
)

it.each(["GET", "PUT"] as const)(
  "%s oculta produto de outra empresa",
  async (method) => {
    db.produto_empresa.findFirst.mockResolvedValue(null)
    const res = await chamar(method)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      success: false,
      error: "Produto não encontrado.",
    })
    expect(db.ficha_tecnica.create).not.toHaveBeenCalled()
  },
)

it("GET responde null quando o produto acessível está sem ficha ativa", async () => {
  const res = await chamar("GET")
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ success: true, data: null })
  expect(db.ficha_tecnica.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id_empresa: 10,
        id_produto: 12,
        status: "ATIVA",
      }),
    }),
  )
})

it("GET retorna somente o contrato e quantidades com três casas", async () => {
  db.ficha_tecnica.findFirst.mockResolvedValue(ficha)
  expect(await (await chamar("GET")).json()).toEqual({
    success: true,
    data: { id: 44, versao: 1, itens: input.itens },
  })
})

it("PUT aceita null na primeira ficha e grava perda zero, vigência imediata e auditoria", async () => {
  const res = await chamar("PUT")
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({
    success: true,
    data: { id: 44, versao: 1, itens: input.itens },
  })
  expect(db.ficha_tecnica.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        id_empresa: 10,
        id_produto: 12,
        versao: 1,
        status: "ATIVA",
        ficha_tecnica_item: {
          create: [
            {
              id_produto_componente: 7,
              quantidade: new Prisma.Decimal("2"),
              perda_percentual: new Prisma.Decimal("0"),
            },
          ],
        },
      }),
    }),
  )
  const created = db.ficha_tecnica.create.mock.calls[0][0].data
  expect(created.data_vigencia.toISOString()).toBe(
    new Date().toISOString().slice(0, 10) + "T00:00:00.000Z",
  )
  expect(db.auditoria.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        id_empresa: 10,
        id_usuario: 1,
        tabela: "ficha_tecnica",
        id_registro: 44,
      }),
    }),
  )
  expect(db.ficha_tecnica.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
    db.ficha_tecnica.create.mock.invocationCallOrder[0],
  )
  expect(db.ordem_producao_consumo_planejado.updateMany).not.toHaveBeenCalled()
})

it("PUT usa a maior versão inclusive rascunhos e inativas", async () => {
  db.ficha_tecnica.aggregate.mockResolvedValue({ _max: { versao: 8 } })
  await chamar("PUT")
  expect(db.ficha_tecnica.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ versao: 9 }) }),
  )
})

it("PUT exige o ID ativo esperado antes de comparar composições", async () => {
  db.ficha_tecnica.findFirst.mockResolvedValue(ficha)
  expect((await chamar("PUT")).status).toBe(409)
  expect(
    (await chamar("PUT", { ...input, id_ficha_esperada: 43 })).status,
  ).toBe(409)
  expect(db.ficha_tecnica.create).not.toHaveBeenCalled()
})

it("PUT com mesma composição normaliza quantidade e preserva a versão atual", async () => {
  db.ficha_tecnica.findFirst.mockResolvedValue(ficha)
  const res = await chamar("PUT", {
    ...input,
    id_ficha_esperada: 44,
    itens: [{ id_produto_componente: 7, quantidade: "2" }],
  })
  expect(res.status).toBe(200)
  expect(db.ficha_tecnica.create).not.toHaveBeenCalled()
  expect(db.ficha_tecnica.updateMany).not.toHaveBeenCalled()
})

it("PUT revalida a permissão dentro da transação", async () => {
  db.usuario_empresa.findMany
    .mockResolvedValueOnce([{ id_empresa: 10 }])
    .mockResolvedValueOnce([])
  expect((await chamar("PUT")).status).toBe(403)
  expect(db.ficha_tecnica.create).not.toHaveBeenCalled()
})

it("PUT rejeita componentes inelegíveis da empresa", async () => {
  db.produto_empresa.count.mockResolvedValue(0)
  expect((await chamar("PUT")).status).toBe(400)
  expect(db.ficha_tecnica.create).not.toHaveBeenCalled()
})

it.each(["GET", "PUT"] as const)(
  "%s rejeita produto inativo ou não fabricável",
  async (method) => {
    db.produto_empresa.findFirst
      .mockResolvedValueOnce({ id_produto: 12 })
      .mockResolvedValueOnce(null)
    expect((await chamar(method)).status).toBe(400)
  },
)

it("PUT mapeia conflitos conhecidos para 409", async () => {
  db.ficha_tecnica.create.mockRejectedValue({ code: "P2034" })
  expect((await chamar("PUT")).status).toBe(409)
})
it("GET rejeita query ambígua e PUT rejeita JSON inválido", async () => {
  const consulta = await request(
    "/api/fichas-tecnicas/ativa?id_produto=12&id_produto=13",
  )
  consulta.headers.set("X-Empresa-Id", "10")
  expect((await GET(consulta)).status).toBe(400)
  const req = new Request("http://localhost/api/fichas-tecnicas/ativa", {
    method: "PUT",
    headers: { Authorization: "Bearer test-token", "X-Empresa-Id": "10" },
    body: "{",
  })
  expect((await PUT(req)).status).toBe(400)
})

it("PUT limita a rajada por usuário autenticado", async () => {
  for (let i = 0; i < 30; i++) expect((await chamar("PUT")).status).toBe(200)
  const res = await chamar("PUT")
  expect(res.status).toBe(429)
  expect((await res.json()).success).toBe(false)
  expect(db.ficha_tecnica.create).toHaveBeenCalledTimes(30)
})

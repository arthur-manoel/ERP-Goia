import { beforeEach, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import * as collection from "@/app/api/empresas/route"
import * as item from "@/app/api/empresas/[id]/route"
import { createEmpresaSchema } from "../../../modules/empresas/schema"
import { db } from "../../helpers/prisma"

const dados = { razao_social: " Empresa ", cnpj: "11.222.333/0001-81" }
const atual = {
  id: 10,
  razao_social: "Empresa",
  cnpj: "11222333000181",
  status: "ATIVA",
}
const context = (id = "10") => ({ params: Promise.resolve({ id }) })
const request = (
  method = "GET",
  body?: unknown,
  suffix = "",
  headers = new Headers({ Authorization: "Bearer test-token" }),
) =>
  new Request("http://localhost/api/empresas" + suffix, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeEach(() => {
  db.usuarios.findFirst.mockResolvedValue({ nivel_acesso: "ADMIN" })
  db.empresas.findFirst.mockResolvedValue(null)
  db.empresas.findMany.mockResolvedValue([atual])
  db.empresas.count.mockResolvedValue(11)
  db.empresas.create.mockResolvedValue(atual)
  db.empresas.update.mockImplementation(async ({ data }) => ({
    ...atual,
    ...data,
  }))
})

it.each([
  { cnpj: "11.222.333/0001-82" },
  { cnpj: "11111111111111" },
  { cnpj: "ABC" },
  { email: "email" },
  { cep: "12345" },
  { estado: "ZZ" },
  { cor_tema: "#123" },
  { logo_url: "javascript:alert(1)" },
  { logo_url: "https://usuario:senha@example.test/logo" },
  { telefone: "3333abc" },
  { razao_social: "" },
  { id: 99 },
  { updated_at: null },
])("rejeita dados inválidos: %j", (override) => {
  expect(createEmpresaSchema.safeParse({ ...dados, ...override }).success).toBe(
    false,
  )
})

it("normaliza CNPJ, contato e endereço antes de persistir e audita o cadastro", async () => {
  const res = await collection.POST(
    request("POST", {
      ...dados,
      email: " CONTATO@EXAMPLE.TEST ",
      estado: "go",
      cidade: " Goiânia ",
      cep: "74000-000",
      telefone: "+55 (62) 98888-1234",
    }),
  )
  expect(res.status).toBe(201)
  expect(db.empresas.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        cnpj: "11222333000181",
        razao_social: "Empresa",
        email: "contato@example.test",
        estado: "GO",
        cidade: "Goiânia",
        cep: "74000000",
        telefone: "+5562988881234",
        cor_tema: "#22c55e",
      }),
    }),
  )
  expect(db.auditoria.create).toHaveBeenCalledWith({
    data: expect.objectContaining({
      id_empresa: 10,
      id_usuario: 1,
      acao: "INSERT",
      dados_novos: expect.stringContaining("CREATE"),
    }),
  })
})

it("converte duplicidade encontrada no banco em 409, inclusive P2002", async () => {
  db.empresas.findFirst.mockResolvedValueOnce(atual)
  expect((await collection.POST(request("POST", dados))).status).toBe(409)
  db.empresas.create.mockRejectedValueOnce(
    new Prisma.PrismaClientKnownRequestError("interno", {
      code: "P2002",
      clientVersion: "7.10.0",
    }),
  )
  expect(await (await collection.POST(request("POST", dados))).json()).toEqual({
    success: false,
    error: "Já existe uma empresa com este CNPJ.",
  })
})

it("usa os mesmos filtros e escopo no count e na página", async () => {
  db.usuarios.findFirst.mockResolvedValue({ nivel_acesso: "USUARIO" })
  const res = await collection.GET(
    request(
      "GET",
      undefined,
      "?page=2&limit=5&cidade=Goiania&search=ABC&status=ATIVA&sortBy=cidade&sortOrder=desc",
    ),
  )
  expect(await res.json()).toEqual({
    success: true,
    data: {
      data: [atual],
      page: 2,
      limit: 5,
      total: 11,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    },
  })
  const query = db.empresas.findMany.mock.calls[0][0]
  expect(query).toMatchObject({
    skip: 5,
    take: 5,
    orderBy: [{ cidade: "desc" }, { id: "asc" }],
  })
  expect(query.where.AND[0].usuario_empresa.some).toMatchObject({
    id_usuario: 1,
    status: "ATIVO",
  })
  expect(JSON.stringify(query.where)).toContain('"pode_ler":true')
  expect(db.empresas.count).toHaveBeenCalledWith({ where: query.where })
})

it.each(["GET", "PUT", "PATCH", "DELETE"] as const)(
  "oculta outra empresa no %s",
  async (metodo) => {
    db.usuarios.findFirst.mockResolvedValue({ nivel_acesso: "USUARIO" })
    const body =
      metodo === "PUT" || metodo === "PATCH"
        ? { razao_social: "Mudança" }
        : undefined
    expect(
      (await item[metodo](request(metodo, body), context("20"))).status,
    ).toBe(404)
    expect(db.empresas.update).not.toHaveBeenCalled()
  },
)

it("nega cadastro, mudança de CNPJ e mudança de status a usuários comuns", async () => {
  db.usuarios.findFirst.mockResolvedValue({ nivel_acesso: "USUARIO" })
  db.empresas.findFirst.mockResolvedValue(atual)
  expect((await collection.POST(request("POST", dados))).status).toBe(403)
  expect(
    (
      await item.PATCH(
        request("PATCH", { cnpj: "04.252.011/0001-10" }),
        context(),
      )
    ).status,
  ).toBe(403)
  expect((await item.DELETE(request("DELETE"), context())).status).toBe(403)
  expect(
    (await item.PATCH(request("PATCH", { status: "ATIVA" }), context())).status,
  ).toBe(403)
  expect(db.empresas.update).not.toHaveBeenCalled()
})

it("PUT substitui opcionais e PATCH preserva os omitidos", async () => {
  db.empresas.findFirst.mockResolvedValue(atual)
  expect(
    (await item.PUT(request("PUT", { razao_social: "Atualizada" }), context()))
      .status,
  ).toBe(200)
  expect(db.empresas.update.mock.calls[0][0].data).toMatchObject({
    nome_fantasia: null,
    email: null,
  })
  expect(
    (await item.PATCH(request("PATCH", { email: null }), context())).status,
  ).toBe(200)
  expect(db.empresas.update.mock.calls[1][0].data).toEqual({
    email: null,
    cnpj: undefined,
  })
})

it("registra inativação e reativação sem excluir a empresa", async () => {
  db.empresas.findFirst.mockResolvedValue(atual)
  expect((await item.DELETE(request("DELETE"), context())).status).toBe(200)
  expect(db.empresas.update.mock.calls[0][0].data).toMatchObject({
    status: "INATIVA",
    inativado_por: 1,
    inativado_em: expect.any(Date),
  })
  db.empresas.findFirst.mockResolvedValue({ ...atual, status: "INATIVA" })
  expect(
    (await item.PATCH(request("PATCH", { status: "ATIVA" }), context())).status,
  ).toBe(200)
  expect(db.empresas.update.mock.calls[1][0].data).toMatchObject({
    status: "ATIVA",
    inativado_por: null,
    inativado_em: null,
  })
  expect(db.empresas.delete).not.toHaveBeenCalled()
  expect(
    db.auditoria.create.mock.calls.map(
      ([args]) => JSON.parse(args.data.dados_novos).evento,
    ),
  ).toEqual(["INACTIVATE", "ACTIVATE"])
})

it("rejeita IDs inválidos, query manipulada, PATCH vazio e payload maior que 16 KiB", async () => {
  expect((await item.GET(request(), context("1e3"))).status).toBe(400)
  expect(
    (await collection.GET(request("GET", undefined, "?id_empresa=20"))).status,
  ).toBe(400)
  expect(
    (await collection.GET(request("GET", undefined, "?page=1&page=2"))).status,
  ).toBe(400)
  expect((await item.PATCH(request("PATCH", {}), context())).status).toBe(400)
  expect(
    (
      await collection.POST(
        request("POST", { ...dados, logo_url: "x".repeat(17000) }),
      )
    ).status,
  ).toBe(400)
})

it("exige sessão e limita escritas por usuário", async () => {
  expect(
    (await collection.GET(request("GET", undefined, "", new Headers()))).status,
  ).toBe(401)
  for (let i = 0; i < 30; i++)
    expect((await collection.POST(request("POST", dados))).status).toBe(201)
  expect((await collection.POST(request("POST", dados))).status).toBe(429)
})

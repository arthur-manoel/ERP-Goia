import { createHash } from "node:crypto"
import { beforeEach, expect, it } from "vitest"
import * as colecao from "@/app/api/cargos/route"
import * as item from "@/app/api/cargos/[id]/route"
import { POST as ativar } from "@/app/api/cargos/[id]/ativar/route"
import { GET as usuarios } from "@/app/api/cargos/[id]/usuarios/route"
import { GET as historico } from "@/app/api/cargos/[id]/historico/route"
import {
  createCargoSchema,
  patchCargoSchema,
} from "../../../modules/cargos/schema"
import { db } from "../../helpers/prisma"

const ctx = { params: Promise.resolve({ id: "5" }) }
const cargo = {
  id: 5,
  id_empresa: 10,
  nome: "Gerente",
  descricao: null,
  status: "ATIVO",
  aprova_cancelamento: false,
}
const tag = (dado = cargo) =>
  '"' +
  createHash("sha256")
    .update(JSON.stringify([dado, 3]))
    .digest("hex") +
  '"'
const req = (
  method = "GET",
  body?: unknown,
  query = "",
  etag = tag(),
  empresa = "10",
) =>
  new Request("http://localhost/api/cargos" + query, {
    method,
    headers: {
      Authorization: "Bearer test-token",
      "X-Empresa-Id": empresa,
      "If-Match": etag,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

beforeEach(() => {
  db.usuario_empresa.findFirst.mockResolvedValue({
    nivel_acesso: "EMPRESA",
    usuarios: { nivel_acesso: "USUARIO" },
  })
  db.cargos.findFirst.mockImplementation(async ({ where }) =>
    where.id === 5 && where.id_empresa === 10 ? cargo : null,
  )
  db.cargos.findMany.mockResolvedValue([
    { ...cargo, _count: { usuario_empresa: 2 } },
  ])
  db.cargos.count.mockResolvedValue(11)
  db.usuario_empresa.count.mockResolvedValue(0)
  db.auditoria.findFirst.mockResolvedValue({ id: 3 })
  db.auditoria.create.mockResolvedValue({ id: 4 })
  db.cargos.create.mockResolvedValue(cargo)
  db.cargos.update.mockImplementation(async ({ data }) => ({
    ...cargo,
    ...data,
  }))
})

it.each([
  { nome: "" },
  { nome: " A " },
  { nome: "A".repeat(101) },
  { descricao: " " },
  { descricao: "D".repeat(256) },
  { id_empresa: -1 },
  { status: "ATIVO" },
  { aprova_cancelamento: "false" },
  { id: 1 },
])("rejeita valores e campos inválidos %j", (valores) => {
  expect(
    createCargoSchema.safeParse({ id_empresa: 10, nome: "Gerente", ...valores })
      .success,
  ).toBe(false)
  expect(patchCargoSchema.safeParse({}).success).toBe(false)
})

it("cria com nome normalizado e audita na transação", async () => {
  const r = await colecao.POST(
    req("POST", { id_empresa: 10, nome: " Gerente  " }),
  )
  expect(r.status).toBe(201)
  expect(r.headers.get("etag")).toMatch(/^"[a-f0-9]{64}"$/)
  expect(db.cargos.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        id_empresa: 10,
        nome: "Gerente",
        descricao: null,
        aprova_cancelamento: false,
      },
    }),
  )
  expect(db.auditoria.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        id_empresa: 10,
        id_registro: 5,
        acao: "INSERT",
      }),
    }),
  )
})

it("não informa cargos fora do escopo e rejeita manipulação de empresa", async () => {
  const outro = { params: Promise.resolve({ id: "6" }) }
  expect((await item.GET(req(), outro)).status).toBe(404)
  expect(
    (await item.PATCH(req("PATCH", { nome: "Outro" }), outro)).status,
  ).toBe(404)
  expect((await item.DELETE(req("DELETE"), outro)).status).toBe(404)
  expect(
    (await colecao.POST(req("POST", { id_empresa: 11, nome: "Outro" }))).status,
  ).toBe(403)
  expect(
    (await colecao.GET(req("GET", undefined, "?id_empresa=11"))).status,
  ).toBe(403)
  expect(db.cargos.update).not.toHaveBeenCalled()
})

it("aplica permissão por operação no contexto e bloqueia flag gerencial", async () => {
  db.usuario_empresa.findFirst.mockResolvedValue({
    nivel_acesso: "USUARIO",
    usuarios: { nivel_acesso: "USUARIO" },
  })
  expect(
    (await item.PATCH(req("PATCH", { aprova_cancelamento: true }), ctx)).status,
  ).toBe(403)
  expect(
    JSON.stringify(db.usuario_empresa.findFirst.mock.calls[0][0].where),
  ).toContain('"pode_editar":true')
  expect((await usuarios(req(), ctx)).status).toBe(403)
  expect((await historico(req(), ctx)).status).toBe(403)
  db.usuario_empresa.findFirst.mockResolvedValue(null)
  expect((await colecao.GET(req())).status).toBe(403)
})

it("pagina e ordena no banco e limita a contagem à empresa", async () => {
  const r = await colecao.GET(
    req(
      "GET",
      undefined,
      "?search=Gerente&page=2&limit=5&aprova_cancelamento=false&sortBy=status&sortOrder=desc",
    ),
  )
  expect(r.status).toBe(200)
  expect((await r.json()).data).toMatchObject({
    page: 2,
    total: 11,
    totalPages: 3,
    data: [{ quantidade_usuarios: 2 }],
  })
  expect(db.cargos.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        id_empresa: 10,
        aprova_cancelamento: false,
      }),
      skip: 5,
      take: 5,
      orderBy: [{ status: "desc" }, { id: "asc" }],
    }),
  )
})

it("consulta detalhe e verifica versão antes de PUT e PATCH", async () => {
  expect((await item.GET(req(), ctx)).headers.get("etag")).toBe(tag())
  expect(
    (
      await item.PATCH(
        req("PATCH", { descricao: "Revisado" }, "", '"' + "0".repeat(64) + '"'),
        ctx,
      )
    ).status,
  ).toBe(409)
  expect(
    (
      await item.PUT(
        req("PUT", { nome: "Gerente", aprova_cancelamento: false }),
        ctx,
      )
    ).status,
  ).toBe(200)
  expect(
    (await item.PATCH(req("PATCH", { descricao: null }), ctx)).status,
  ).toBe(200)
  expect(db.cargos.update.mock.calls[1][0].data).toEqual({ descricao: null })
})

it("inativação bloqueia vínculo ativo e ativação repetida não audita", async () => {
  db.usuario_empresa.count.mockResolvedValueOnce(1)
  expect((await item.DELETE(req("DELETE"), ctx)).status).toBe(409)
  expect((await ativar(req("POST"), ctx)).status).toBe(200)
  expect(db.auditoria.create).not.toHaveBeenCalled()
  expect((await item.DELETE(req("DELETE"), ctx)).status).toBe(200)
  expect(db.cargos.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { status: "INATIVO" } }),
  )
  const inativo = { ...cargo, status: "INATIVO" }
  db.cargos.findFirst.mockImplementation(async ({ where }) =>
    where.id === 5 ? inativo : null,
  )
  expect(
    (await ativar(req("POST", undefined, "", tag(inativo)), ctx)).status,
  ).toBe(200)
})

it("protege sessão e limita rajadas", async () => {
  expect((await colecao.GET(new Request("http://localhost"))).status).toBe(401)
  for (let i = 0; i < 30; i++)
    expect(
      (await colecao.POST(req("POST", { id_empresa: 10, nome: "Gerente" })))
        .status,
    ).toBe(201)
  expect(
    (await colecao.POST(req("POST", { id_empresa: 10, nome: "Gerente" })))
      .status,
  ).toBe(429)
})

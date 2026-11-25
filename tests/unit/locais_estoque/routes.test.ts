import { beforeEach, expect, it } from "vitest"
import * as collection from "../../../src/app/api/locais_estoque/route"
import * as item from "../../../src/app/api/locais_estoque/[id]/route"
import type { LocalEstoque } from "../../../modules/locais_estoque/repository"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { db } from "../../helpers/prisma"
import { context, request } from "../../helpers/http"

const row: LocalEstoque = {
  id: 1,
  id_empresa: 10,
  nome: "Depósito central",
  descricao: "Galpão",
  status: "ATIVO",
}

beforeEach(() => {
  resetRateLimitsForTests()
  // Trava de linha (SELECT ... FOR UPDATE) encontra o local 1 da empresa 10.
  db.$queryRaw.mockResolvedValue([{ id: 1 }])
  db.locais_estoque.findFirst.mockResolvedValue(row)
  db.locais_estoque.findUnique.mockResolvedValue(row)
  db.locais_estoque.create.mockImplementation(async ({ data }) => ({
    ...row,
    ...data,
  }))
  db.locais_estoque.update.mockImplementation(async ({ data }) => ({
    ...row,
    ...data,
  }))
  db.estoque.count.mockResolvedValue(0)
})

const operations = [
  ["GET", "pode_ler", (req: Request) => collection.GET(req)],
  ["POST", "pode_criar", (req: Request) => collection.POST(req)],
  ["GET ID", "pode_ler", (req: Request) => item.GET(req, context())],
  ["PATCH", "pode_editar", (req: Request) => item.PATCH(req, context())],
  ["DELETE", "pode_excluir", (req: Request) => item.DELETE(req, context())],
] as const

it.each(operations)(
  "%s exige JWT válido, vínculo e permissão ESTOQUE por operação",
  async (_, permission, invoke) => {
    const req = await request("/api/locais_estoque")
    req.headers.delete("Authorization")
    expect((await invoke(req)).status).toBe(401)
    expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()

    req.headers.set("Authorization", "Bearer test-token")
    db.usuario_empresa.findMany.mockResolvedValue([])
    expect((await invoke(req)).status).toBe(403)
    expect(db.usuario_empresa.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              permissoes_usuario: {
                some: { recurso: "ESTOQUE", [permission]: true },
              },
            },
          ]),
        }),
      }),
    )
    expect(db.locais_estoque.create).not.toHaveBeenCalled()
    expect(db.locais_estoque.update).not.toHaveBeenCalled()
  },
)

it("lista só as empresas autorizadas, com filtro e paginação", async () => {
  db.locais_estoque.findMany.mockResolvedValue([row])
  db.locais_estoque.count.mockResolvedValue(1)
  const response = await collection.GET(
    await request("/api/locais_estoque?page=1&limit=50&status=ATIVO"),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({
    rows: [row],
    count: 1,
    page: 1,
    limit: 50,
    totalPages: 1,
  })
  expect(db.locais_estoque.findMany.mock.calls[0][0].where).toEqual({
    AND: [{ id_empresa: { in: [10] } }, { status: "ATIVO" }],
  })
})

it("recusa parâmetros de busca desconhecidos", async () => {
  expect(
    (await collection.GET(await request("/api/locais_estoque?foo=1"))).status,
  ).toBe(400)
})

it("cria o local na empresa do usuário e recusa nome repetido", async () => {
  db.locais_estoque.findFirst.mockResolvedValue(null)
  const ok = await collection.POST(
    await request("/api/locais_estoque", "POST", { nome: "  Loja  " }),
  )
  expect(ok.status).toBe(201)
  expect(db.locais_estoque.create.mock.calls[0][0].data).toEqual({
    id_empresa: 10,
    nome: "Loja",
    descricao: null,
    status: "ATIVO",
  })

  db.locais_estoque.findFirst.mockResolvedValue(row)
  const repetido = await collection.POST(
    await request("/api/locais_estoque", "POST", { nome: "Loja" }),
  )
  expect(repetido.status).toBe(409)
})

it("não cria local em empresa que o usuário não acessa", async () => {
  const response = await collection.POST(
    await request("/api/locais_estoque", "POST", {
      nome: "Loja",
      id_empresa: 99,
    }),
  )
  expect(response.status).toBe(403)
  expect(db.locais_estoque.create).not.toHaveBeenCalled()
})

it("GET por ID devolve 404 quando o local não é da empresa", async () => {
  expect(
    (await item.GET(await request("/api/locais_estoque/1"), context())).status,
  ).toBe(200)
  db.locais_estoque.findFirst.mockResolvedValue(null)
  expect(
    (await item.GET(await request("/api/locais_estoque/1"), context())).status,
  ).toBe(404)
})

it("PATCH altera só o que foi enviado e verifica nome repetido", async () => {
  // Só a descrição muda: não há checagem de nome, só a leitura do local.
  const ok = await item.PATCH(
    await request("/api/locais_estoque/1", "PATCH", { descricao: "Novo" }),
    context(),
  )
  expect(ok.status).toBe(200)
  expect(db.locais_estoque.update.mock.calls[0][0].data).toEqual({
    descricao: "Novo",
  })

  db.locais_estoque.update.mockClear()
  db.locais_estoque.findFirst
    .mockResolvedValueOnce(row) // findById
    .mockResolvedValueOnce({ ...row, id: 2 }) // checkName acha outro
  const repetido = await item.PATCH(
    await request("/api/locais_estoque/1", "PATCH", { nome: "Loja" }),
    context(),
  )
  expect(repetido.status).toBe(409)
  expect(db.locais_estoque.update).not.toHaveBeenCalled()
})

it("PATCH não aceita trocar de empresa nem corpo vazio", async () => {
  for (const body of [{ id_empresa: 20 }, {}]) {
    const response = await item.PATCH(
      await request("/api/locais_estoque/1", "PATCH", body),
      context(),
    )
    expect(response.status).toBe(400)
  }
  expect(db.locais_estoque.update).not.toHaveBeenCalled()
})

it("DELETE inativa sem apagar o registro", async () => {
  const response = await item.DELETE(
    await request("/api/locais_estoque/1", "DELETE"),
    context(),
  )
  expect(response.status).toBe(200)
  expect(db.locais_estoque.update.mock.calls[0][0].data).toEqual({
    status: "INATIVO",
  })
  expect(db.locais_estoque.delete).not.toHaveBeenCalled()
})

it.each([
  ["DELETE", () => request("/api/locais_estoque/1", "DELETE")],
  [
    "PATCH",
    () => request("/api/locais_estoque/1", "PATCH", { status: "INATIVO" }),
  ],
] as const)(
  "%s recusa inativar local com saldo ou reserva",
  async (method, montar) => {
    db.estoque.count.mockResolvedValue(2)
    const response = await item[method](await montar(), context())
    expect(response.status).toBe(409)
    expect(db.estoque.count).toHaveBeenCalledWith({
      where: {
        id_local_estoque: 1,
        OR: [{ quantidade: { gt: 0 } }, { quantidade_reservada: { gt: 0 } }],
      },
    })
    expect(db.locais_estoque.update).not.toHaveBeenCalled()
  },
)

it("inativar exige pode_excluir, mesmo por PATCH", async () => {
  db.usuario_empresa.findMany.mockImplementation(async ({ where }) =>
    where.OR.some(
      (c: { permissoes_usuario?: { some: { pode_excluir?: boolean } } }) =>
        c.permissoes_usuario?.some.pode_excluir,
    )
      ? []
      : [{ id_empresa: 10 }],
  )
  const response = await item.PATCH(
    await request("/api/locais_estoque/1", "PATCH", { status: "INATIVO" }),
    context(),
  )
  expect(response.status).toBe(403)
  expect(db.locais_estoque.update).not.toHaveBeenCalled()
})

it("reativar um local inativo não exige saldo", async () => {
  db.locais_estoque.findFirst.mockResolvedValue({ ...row, status: "INATIVO" })
  const response = await item.PATCH(
    await request("/api/locais_estoque/1", "PATCH", { status: "ATIVO" }),
    context(),
  )
  expect(response.status).toBe(200)
  expect(db.estoque.count).not.toHaveBeenCalled()
  expect(db.locais_estoque.update.mock.calls[0][0].data).toEqual({
    status: "ATIVO",
  })
})

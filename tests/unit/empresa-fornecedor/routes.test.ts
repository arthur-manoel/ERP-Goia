import { beforeEach, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import * as collection from "@/app/api/empresa-fornecedor/route"
import * as itemRoute from "@/app/api/empresa-fornecedor/[id]/route"
import { GET as available } from "@/app/api/empresa-fornecedor/fornecedores/route"
import { db } from "../../helpers/prisma"
import { context, request } from "../../helpers/http"
import { resetRateLimitsForTests } from "@/lib/api/rate-limit"
const supplier = {
  id: 50,
  id_empresa: null,
  razao_social: "Fornecedor global",
  nome_fantasia: "Tecidos",
  cnpj: "12345678000190",
  status: "ATIVO",
}
const base = {
  id: 1,
  id_empresa: 10,
  id_fornecedor: 50,
  prazo_pagamento: 30,
  prazo_entrega: 5,
  observacao: "Somente manhã",
  status: "ATIVO",
  fornecedores: supplier,
}
let stored: typeof base | null
beforeEach(() => {
  resetRateLimitsForTests()
  stored = null
  db.$queryRaw.mockResolvedValue([{ id: 10 }])
  db.fornecedores.findFirst.mockResolvedValue(supplier)
  db.empresa_fornecedor.findFirst.mockImplementation(async ({ where }) => {
    const filters = where.AND ?? [where]
    return stored &&
      filters.every(
        (f: Record<string, unknown>) =>
          (f.id === undefined || f.id === stored!.id) &&
          (f.id_empresa === undefined || f.id_empresa === stored!.id_empresa) &&
          (f.id_fornecedor === undefined ||
            f.id_fornecedor === stored!.id_fornecedor),
      )
      ? { ...stored }
      : null
  })
  db.empresa_fornecedor.create.mockImplementation(async ({ data }) => {
    stored = { ...base, ...data }
    return { ...stored }
  })
  db.empresa_fornecedor.update.mockImplementation(async ({ data }) => {
    stored = { ...stored!, ...data }
    return { ...stored }
  })
})
const post = async (body: unknown) =>
  collection.POST(await request("/api/empresa-fornecedor", "POST", body))
const patch = async (body: unknown, id = "1") =>
  itemRoute.PATCH(
    await request(`/api/empresa-fornecedor/${id}`, "PATCH", body),
    context(id),
  )
it("cria vínculo global com empresa do contexto e audita na transação", async () => {
  expect((await post({ id_fornecedor: 50, prazo_pagamento: 0 })).status).toBe(
    201,
  )
  expect(db.empresa_fornecedor.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        id_empresa: 10,
        id_fornecedor: 50,
        prazo_pagamento: 0,
        prazo_entrega: null,
        observacao: null,
        status: "ATIVO",
      },
    }),
  )
  expect(db.auditoria.create).toHaveBeenCalledOnce()
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "ReadCommitted",
    timeout: 15_000,
  })
})
it("duplicidade ativa é 409", async () => {
  stored = { ...base }
  expect((await post({ id_fornecedor: 50 })).status).toBe(409)
  expect(db.empresa_fornecedor.create).not.toHaveBeenCalled()
})
it("reativa com o ID original e preserva campos omitidos", async () => {
  stored = { ...base, status: "INATIVO" }
  const response = await post({ id_fornecedor: 50, prazo_entrega: 0 })
  expect(response.status).toBe(201)
  expect((await response.json()).data).toMatchObject({
    id: 1,
    prazo_pagamento: 30,
    prazo_entrega: 0,
    observacao: "Somente manhã",
    status: "ATIVO",
  })
  expect(db.empresa_fornecedor.create).not.toHaveBeenCalled()
  expect(db.empresa_fornecedor.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { prazo_entrega: 0, status: "ATIVO" } }),
  )
})
it("PATCH limpa null e não reescreve campos omitidos", async () => {
  stored = { ...base }
  expect((await patch({ observacao: null })).status).toBe(200)
  expect(stored).toMatchObject({
    prazo_pagamento: 30,
    prazo_entrega: 5,
    observacao: null,
  })
  expect(db.empresa_fornecedor.update).toHaveBeenCalledWith(
    expect.objectContaining({ data: { observacao: null } }),
  )
})
it("PUT substitui todos os campos comerciais", async () => {
  stored = { ...base }
  const response = await itemRoute.PUT(
    await request("/api/empresa-fornecedor/1", "PUT", {
      prazo_pagamento: 15,
      prazo_entrega: null,
      observacao: null,
      status: "ATIVO",
    }),
    context(),
  )
  expect(response.status).toBe(200)
  expect(stored).toMatchObject({
    prazo_pagamento: 15,
    prazo_entrega: null,
    observacao: null,
  })
  expect(
    (
      await itemRoute.PUT(
        await request("/api/empresa-fornecedor/1", "PUT", { status: "ATIVO" }),
        context(),
      )
    ).status,
  ).toBe(400)
})
it("DELETE é lógico e idempotente", async () => {
  stored = { ...base }
  for (let i = 0; i < 2; i++)
    expect(
      (
        await itemRoute.DELETE(
          await request("/api/empresa-fornecedor/1", "DELETE"),
          context(),
        )
      ).status,
    ).toBe(200)
  expect(stored?.status).toBe("INATIVO")
  expect(db.empresa_fornecedor.update).toHaveBeenCalledOnce()
  expect(db.empresa_fornecedor.delete).not.toHaveBeenCalled()
  expect(db.auditoria.create).toHaveBeenCalledOnce()
})
it.each([10, 20])(
  "não associa fornecedores específicos de empresa %s",
  async () => {
    // O filtro global faz o registro de qualquer empresa ficar indisponível nesta consulta.
    db.fornecedores.findFirst.mockResolvedValue(null)
    expect((await post({ id_fornecedor: 50 })).status).toBe(400)
    expect(db.fornecedores.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 50, id_empresa: null } }),
    )
    expect(db.empresa_fornecedor.create).not.toHaveBeenCalled()
  },
)
it("não associa fornecedor global inativo", async () => {
  db.fornecedores.findFirst.mockResolvedValue({
    ...supplier,
    status: "INATIVO",
  })
  expect((await post({ id_fornecedor: 50 })).status).toBe(400)
})
it("consulta, alteração e DELETE de outra empresa retornam 404", async () => {
  stored = { ...base, id_empresa: 20 }
  expect(
    (await itemRoute.GET(await request("/api/empresa-fornecedor/1"), context()))
      .status,
  ).toBe(404)
  expect((await patch({ observacao: "x" })).status).toBe(404)
  expect(
    (
      await itemRoute.DELETE(
        await request("/api/empresa-fornecedor/1", "DELETE"),
        context(),
      )
    ).status,
  ).toBe(404)
  expect(db.empresa_fornecedor.update).not.toHaveBeenCalled()
})
it("não aceita empresa do cliente nem permite selecionar vínculo não autorizado", async () => {
  expect((await post({ id_fornecedor: 50, id_empresa: 20 })).status).toBe(400)
  expect(
    (
      await collection.GET(
        await request("/api/empresa-fornecedor?id_empresa=20"),
      )
    ).status,
  ).toBe(400)
  const req = await request("/api/empresa-fornecedor")
  req.headers.set("X-Empresa-Id", "20")
  expect((await collection.GET(req)).status).toBe(403)
})
it("token inválido é 401; falta de permissão/vínculo é 403", async () => {
  expect(
    (
      await collection.GET(
        new Request("http://localhost/api/empresa-fornecedor"),
      )
    ).status,
  ).toBe(401)
  db.usuario_empresa.findMany.mockResolvedValue([])
  expect((await post({ id_fornecedor: 50 })).status).toBe(403)
})
it("inativar por PATCH exige permissão de excluir", async () => {
  stored = { ...base }
  db.usuario_empresa.findMany.mockImplementation(async ({ where }) =>
    JSON.stringify(where).includes('"pode_excluir":true')
      ? []
      : [{ id_empresa: 10 }],
  )
  expect((await patch({ status: "INATIVO" })).status).toBe(403)
  expect(db.empresa_fornecedor.update).not.toHaveBeenCalled()
})
it("usa permissão FORNECEDORES e mantém exigência de vínculo ativo para administradores", async () => {
  stored = { ...base }
  await itemRoute.GET(await request("/api/empresa-fornecedor/1"), context())
  expect(db.usuario_empresa.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        status: "ATIVO",
        usuarios: { status: "ATIVO" },
        empresas: { status: "ATIVA" },
        OR: expect.arrayContaining([
          {
            permissoes_usuario: {
              some: { recurso: "FORNECEDORES", pode_ler: true },
            },
          },
        ]),
      }),
    }),
  )
})
it("Prisma P2002 é 409 sem detalhes internos", async () => {
  db.empresa_fornecedor.create.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError("SQL interno", {
      code: "P2002",
      clientVersion: "7.10.0",
    }),
  )
  const response = await post({ id_fornecedor: 50 })
  expect(response.status).toBe(409)
  expect(JSON.stringify(await response.json())).not.toContain("SQL interno")
})
it("aplica count, busca relacional, filtros e paginação no Prisma", async () => {
  db.empresa_fornecedor.findMany.mockResolvedValue([base])
  db.empresa_fornecedor.count.mockResolvedValue(21)
  const response = await collection.GET(
    await request(
      "/api/empresa-fornecedor?page=2&limit=10&busca=Tecidos&status=ATIVO&id_fornecedor=50",
    ),
  )
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({
    count: 21,
    page: 2,
    limit: 10,
    totalPages: 3,
  })
  expect(db.empresa_fornecedor.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      skip: 10,
      take: 10,
      where: {
        AND: expect.arrayContaining([
          { id_empresa: 10, fornecedores: { id_empresa: null } },
        ]),
      },
    }),
  )
  expect(
    JSON.stringify(db.empresa_fornecedor.findMany.mock.calls[0][0].where),
  ).toContain('"contains":"Tecidos"')
  expect(db.empresa_fornecedor.count).toHaveBeenCalledWith({
    where: db.empresa_fornecedor.findMany.mock.calls[0][0].where,
  })
})
it("descoberta de globais não retorna específicos nem associações de outras empresas", async () => {
  db.fornecedores.findMany.mockResolvedValue([])
  db.fornecedores.count.mockResolvedValue(0)
  expect(
    (
      await available(
        await request(
          "/api/empresa-fornecedor/fornecedores?tipo=GLOBAL_DISPONIVEL",
        ),
      )
    ).status,
  ).toBe(200)
  expect(db.fornecedores.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        AND: expect.arrayContaining([
          {
            id_empresa: null,
            empresa_fornecedor: { none: { id_empresa: 10, status: "ATIVO" } },
          },
        ]),
      },
      select: expect.objectContaining({
        empresa_fornecedor: expect.objectContaining({
          where: { id_empresa: 10 },
        }),
      }),
    }),
  )
})
it("condições de empresas diferentes são independentes", async () => {
  stored = { ...base, prazo_pagamento: 30 }
  expect((await patch({ prazo_pagamento: 15 })).status).toBe(200)
  expect(db.empresa_fornecedor.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 1, id_empresa: 10, fornecedores: { id_empresa: null } },
    }),
  )
  const req = await request("/api/empresa-fornecedor/1", "PATCH", {
    prazo_pagamento: 90,
  })
  req.headers.set("X-Empresa-Id", "20")
  expect((await itemRoute.PATCH(req, context())).status).toBe(403)
  expect(stored?.prazo_pagamento).toBe(15)
})
it("criações concorrentes são serializadas sem duplicar a associação", async () => {
  let tail = Promise.resolve()
  db.$transaction.mockImplementation(async (operation) => {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await operation(db)
    } finally {
      release()
    }
  })
  const results = await Promise.all([
    post({ id_fornecedor: 50 }),
    post({ id_fornecedor: 50 }),
  ])
  expect(results.map((r) => r.status).sort()).toEqual([201, 409])
  expect(db.empresa_fornecedor.create).toHaveBeenCalledOnce()
  const sql = db.$queryRaw.mock.calls
    .map(([query]) => query.join(""))
    .join("\n")
  expect(sql).toContain("FOR UPDATE")
  expect(sql).toContain("id_empresa IS NULL")
})
it("um usuário vinculado a duas empresas mantém negociações independentes para o mesmo fornecedor", async () => {
  const rows = [
    { ...base },
    {
      ...base,
      id: 2,
      id_empresa: 20,
      prazo_pagamento: 60,
      observacao: "Entrega agendada",
    },
  ]
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  db.empresa_fornecedor.findFirst.mockImplementation(
    async ({ where }) =>
      rows.find((row) =>
        where.AND.every(
          (f: Record<string, unknown>) =>
            (f.id_empresa === undefined || f.id_empresa === row.id_empresa) &&
            (f.id === undefined || f.id === row.id),
        ),
      ) ?? null,
  )
  db.empresa_fornecedor.update.mockImplementation(async ({ where, data }) => {
    const target = rows.find(
      (row) => row.id === where.id && row.id_empresa === where.id_empresa,
    )!
    Object.assign(target, data)
    return { ...target }
  })
  const first = await request("/api/empresa-fornecedor/1", "PATCH", {
    prazo_pagamento: 15,
  })
  first.headers.set("X-Empresa-Id", "10")
  expect((await itemRoute.PATCH(first, context("1"))).status).toBe(200)
  const second = await request("/api/empresa-fornecedor/2", "DELETE")
  second.headers.set("X-Empresa-Id", "20")
  expect((await itemRoute.DELETE(second, context("2"))).status).toBe(200)
  expect(rows[0]).toMatchObject({
    id: 1,
    prazo_pagamento: 15,
    status: "ATIVO",
    observacao: "Somente manhã",
  })
  expect(rows[1]).toMatchObject({
    id: 2,
    prazo_pagamento: 60,
    status: "INATIVO",
    observacao: "Entrega agendada",
  })
})
it("rate limit rejeita a 121ª leitura pela identidade autenticada", async () => {
  db.empresa_fornecedor.findMany.mockResolvedValue([])
  db.empresa_fornecedor.count.mockResolvedValue(0)
  const responses = await Promise.all(
    Array.from({ length: 121 }, async () =>
      collection.GET(await request("/api/empresa-fornecedor")),
    ),
  )
  expect(responses.filter((r) => r.status === 200)).toHaveLength(120)
  expect(responses.filter((r) => r.status === 429)).toHaveLength(1)
})

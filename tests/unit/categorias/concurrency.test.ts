import { beforeEach, expect, it, vi } from "vitest"
import * as collection from "../../../src/app/api/categorias/route"
import * as item from "../../../src/app/api/categorias/[id]/route"
import * as products from "../../../src/app/api/produtos/route"
import * as productItem from "../../../src/app/api/produtos/[id]/route"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { input, row } from "./fixtures"

const product = {
  id_empresa: 10,
  codigo: "F1",
  nome: "Tecido",
  id_tipo_produto: 1,
  id_categoria: 1,
  unidade: "UN",
  controla_estoque: 1,
  permite_compra: 1,
  permite_venda: 1,
  permite_producao: 0,
}
beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockImplementation(async (sql, ids) => {
    const query = sql.join("")
    if (query.includes("REGEXP_REPLACE")) return []
    if (query.includes("FROM empresas"))
      return ids.values.map((id: number) => ({ id }))
    return [{ id: 1 }]
  })
  db.categorias.findFirst.mockResolvedValue(row)
  db.produtos.findFirst.mockResolvedValue(null)
  db.produtos.create.mockResolvedValue({ id: 1, ...product })
  db.produtos.count.mockResolvedValue(0)
  db.produtos.update.mockResolvedValue({ id: 1, ...product })
})
// Simula exclusão mútua; verifica o SQL abaixo, sem usar um MySQL real.
function transactions(firstGate?: Promise<void>) {
  let tail = Promise.resolve()
  let entered = 0
  db.$transaction.mockImplementation(async (operation) => {
    const first = entered++ === 0
    const previous = tail
    let release!: () => void
    tail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      if (first && firstGate) await firstGate
      return await operation(db)
    } finally {
      release()
    }
  })
}

it("criações concorrentes com caixa e espaços distintos não duplicam categoria ativa", async () => {
  transactions()
  let stored: typeof row | undefined
  db.$queryRaw.mockImplementation(async (sql) =>
    sql.join("").includes("REGEXP_REPLACE")
      ? stored
        ? [stored]
        : []
      : [{ id: 10 }],
  )
  db.categorias.create.mockImplementation(async ({ data }) => {
    stored = { ...row, ...data }
    return stored
  })
  const responses = await Promise.all([
    collection.POST(await request("/api/categorias", "POST", input)),
    collection.POST(
      await request("/api/categorias", "POST", {
        ...input,
        nome: " malha\tlisa ",
      }),
    ),
  ])
  expect(responses.map((response) => response.status)).toEqual([201, 409])
  expect(db.categorias.create).toHaveBeenCalledOnce()
  expect(stored?.nome).toBe("Malha Lisa")
})

it.each(["INATIVA", "outra empresa"])(
  "produto não aceita categoria %s na criação ou edição",
  async (kind) => {
    db.categorias.findFirst.mockResolvedValue(
      kind === "INATIVA" ? { ...row, status: "INATIVA" } : null,
    )
    expect(
      (await products.POST(await request("/api/produtos", "POST", product)))
        .status,
    ).toBe(400)
    db.produtos.findFirst.mockResolvedValue({
      id: 1,
      produto_empresa: [{ id_empresa: 10 }],
    })
    expect(
      (
        await productItem.PATCH(
          await request("/api/produtos/1", "PATCH", { id_categoria: 1 }),
          context(),
        )
      ).status,
    ).toBe(400)
    expect(db.produtos.create).not.toHaveBeenCalled()
    expect(db.produtos.update).not.toHaveBeenCalled()
  },
)

it("categoria empresarial não pode ser atribuída a produto compartilhado com outra empresa", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  db.produtos.findFirst.mockResolvedValue({
    id: 1,
    produto_empresa: [{ id_empresa: 10 }, { id_empresa: 20 }],
  })
  expect(
    (
      await productItem.PUT(
        await request("/api/produtos/1", "PUT", { id_categoria: 1 }),
        context(),
      )
    ).status,
  ).toBe(400)
  expect(db.produtos.update).not.toHaveBeenCalled()
})

it.each([true, false])(
  "transferência concorrente e associação de produto preservam empresa (produto primeiro: %s)",
  async (productFirst) => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    transactions(gate)
    db.usuario_empresa.findMany.mockResolvedValue([
      { id_empresa: 10 },
      { id_empresa: 20 },
    ])
    let category = { ...row }
    let linked = 0
    db.categorias.findFirst.mockImplementation(async ({ where }) =>
      where.id_empresa.in.includes(category.id_empresa)
        ? { ...category }
        : null,
    )
    db.categorias.update.mockImplementation(async ({ data }) => {
      category = { ...category, ...data }
      return category
    })
    db.produtos.create.mockImplementation(async () => {
      linked++
      return { id: 1, ...product }
    })
    db.produtos.count.mockImplementation(async () => linked)
    const create = async () =>
      products.POST(await request("/api/produtos", "POST", product))
    const transfer = async () =>
      item.PATCH(
        await request("/api/categorias/1", "PATCH", { id_empresa: 20 }),
        context(),
      )
    const first = productFirst ? create() : transfer()
    await vi.waitFor(() => expect(db.$transaction).toHaveBeenCalledTimes(1))
    const second = productFirst ? transfer() : create()
    await vi.waitFor(() => expect(db.$transaction).toHaveBeenCalledTimes(2))
    release()
    const responses = await Promise.all([first, second])
    expect(responses.map((response) => response.status)).toEqual(
      productFirst ? [201, 409] : [200, 400],
    )
    expect(category.id_empresa).toBe(productFirst ? 10 : 20)
    expect(linked).toBe(productFirst ? 1 : 0)
    const queries = db.$queryRaw.mock.calls.map(([sql]) => sql.join("?"))
    expect(
      queries.filter(
        (sql) => sql.includes("FROM empresas") && sql.includes("FOR UPDATE"),
      ),
    ).toHaveLength(2)
    expect(
      queries.some(
        (sql) => sql.includes("FROM categorias") && sql.includes("FOR UPDATE"),
      ),
    ).toBe(true)
  },
)

it("produto inexistente retorna 404 antes de validar categoria", async () => {
  db.produtos.findFirst.mockResolvedValue(null)
  expect(
    (
      await productItem.PATCH(
        await request("/api/produtos/1", "PATCH", { id_categoria: 99 }),
        context(),
      )
    ).status,
  ).toBe(404)
  expect(db.categorias.findFirst).not.toHaveBeenCalled()
})

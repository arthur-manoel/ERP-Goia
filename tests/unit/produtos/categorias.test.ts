import { beforeEach, expect, it, vi } from "vitest"
import * as collection from "../../../src/app/api/produtos/route"
import * as item from "../../../src/app/api/produtos/[id]/route"
import * as categoryItem from "../../../src/app/api/categorias/[id]/route"
import * as products from "../../../modules/produtos/repository"
import * as categories from "../../../modules/categorias/repository"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"

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
  id_categoria: 3,
}
const product = {
  id: 1,
  codigo: "P1",
  id_categoria: 3,
  produto_empresa: [{ id_empresa: 10 }],
}

beforeEach(() => {
  resetRateLimitsForTests()
  db.$queryRaw.mockResolvedValue([])
  db.produtos.findFirst.mockResolvedValue(null)
  db.produtos.create.mockResolvedValue(product)
  db.produtos.update.mockResolvedValue(product)
  db.categorias.findFirst.mockResolvedValue({ id: 3 })
})

it("cria com categoria ativa da empresa e valida após adquirir o bloqueio", async () => {
  expect(
    (await collection.POST(await request("/api/produtos", "POST", body)))
      .status,
  ).toBe(201)
  expect(db.categorias.findFirst).toHaveBeenCalledWith({
    where: { id: 3, id_empresa: 10, status: "ATIVA" },
    select: { id: true },
  })
  expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
    db.categorias.findFirst.mock.invocationCallOrder[0],
  )
  expect(db.categorias.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
    db.produtos.create.mock.invocationCallOrder[0],
  )
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "ReadCommitted",
  })
})

it("não usa autorização em outra empresa como permissão para uma categoria cruzada", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  db.categorias.findFirst.mockResolvedValue(null)
  const response = await collection.POST(
    await request("/api/produtos", "POST", body),
  )
  expect(response.status).toBe(400)
  expect((await response.json()).error).toContain("mesma empresa")
  expect(db.categorias.findFirst).toHaveBeenCalledWith({
    where: { id: 3, id_empresa: 10, status: "ATIVA" },
    select: { id: true },
  })
  expect(db.produtos.create).not.toHaveBeenCalled()
})

it.each(["PUT", "PATCH"])(
  "%s rejeita associação a categoria inexistente, inativa ou de outra empresa",
  async (method) => {
    db.produtos.findFirst.mockResolvedValue(product)
    db.categorias.findFirst.mockResolvedValue(null)
    const invoke = method === "PUT" ? item.PUT : item.PATCH
    const response = await invoke(
      await request("/api/produtos/1", method, { id_categoria: 3 }),
      context(),
    )
    expect(response.status).toBe(400)
    expect(db.categorias.findFirst).toHaveBeenCalledWith({
      where: { id: 3, id_empresa: 10, status: "ATIVA" },
      select: { id: true },
    })
    expect(db.produtos.update).not.toHaveBeenCalled()
  },
)

it("PATCH usa os vínculos persistidos e não apenas a lista de empresas do usuário", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  db.produtos.findFirst.mockResolvedValue({
    ...product,
    produto_empresa: [{ id_empresa: 20 }],
  })
  const response = await item.PATCH(
    await request("/api/produtos/1", "PATCH", { id_categoria: 3 }),
    context(),
  )
  expect(response.status).toBe(200)
  expect(db.categorias.findFirst).toHaveBeenCalledWith({
    where: { id: 3, id_empresa: 20, status: "ATIVA" },
    select: { id: true },
  })
})

it("rejeita categoria empresarial em produto compartilhado por empresas diferentes", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  db.produtos.findFirst.mockResolvedValue({
    ...product,
    produto_empresa: [{ id_empresa: 10 }, { id_empresa: 20 }],
  })
  const response = await item.PATCH(
    await request("/api/produtos/1", "PATCH", { id_categoria: 3 }),
    context(),
  )
  expect(response.status).toBe(400)
  expect(db.produtos.update).not.toHaveBeenCalled()
})

it("retorna 404 antes de consultar categoria de um produto fora do escopo de escrita", async () => {
  const response = await item.PATCH(
    await request("/api/produtos/1", "PATCH", { id_categoria: 3 }),
    context(),
  )
  expect(response.status).toBe(404)
  expect(db.produtos.findFirst).toHaveBeenCalledWith({
    where: {
      id: 1,
      produto_empresa: {
        some: { id_empresa: { in: [10] } },
        every: { id_empresa: { in: [10] } },
      },
    },
    include: { produto_empresa: { select: { id_empresa: true } } },
  })
  expect(db.categorias.findFirst).not.toHaveBeenCalled()
})

it("permite limpar categoria ou editar outros campos preservando vínculo histórico inativo", async () => {
  expect(
    (
      await item.PATCH(
        await request("/api/produtos/1", "PATCH", { id_categoria: null }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(
    (
      await item.PATCH(
        await request("/api/produtos/1", "PATCH", { nome: "Novo" }),
        context(),
      )
    ).status,
  ).toBe(200)
  expect(db.categorias.findFirst).not.toHaveBeenCalled()
})

it("produtos e categorias utilizam o mesmo protocolo de bloqueio", () => {
  expect(products.withCompaniesLock).toBe(categories.withCompaniesLock)
})

/** Simula a exclusão mútua da transação para controlar as duas ordens de
 * execução. Não substitui a verificação de FOR UPDATE com MySQL real.
 */
function serialTransactions() {
  let tail = Promise.resolve()
  db.$transaction.mockImplementation(async (operation) => {
    const previous = tail
    let unlock!: () => void
    tail = new Promise<void>((resolve) => {
      unlock = resolve
    })
    await previous
    try {
      return await operation(db)
    } finally {
      unlock()
    }
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

it("criação vencedora impede transferência concorrente da categoria", async () => {
  serialTransactions()
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  const category = {
    id: 3,
    id_empresa: 10,
    nome: "Tecidos",
    descricao: null,
    status: "ATIVA",
  }
  const validation = deferred<typeof category>()
  let links = 0
  db.categorias.findFirst
    .mockResolvedValue(category)
    .mockReturnValueOnce(validation.promise)
  db.produtos.create.mockImplementation(async () => {
    links += 1
    return product
  })
  db.produtos.count.mockImplementation(async () => links)
  const creating = collection.POST(await request("/api/produtos", "POST", body))
  await vi.waitFor(() =>
    expect(db.categorias.findFirst).toHaveBeenCalledTimes(1),
  )
  const transferring = categoryItem.PATCH(
    await request("/api/categorias/3", "PATCH", { id_empresa: 20 }),
    context("3"),
  )
  await vi.waitFor(() => expect(db.$transaction).toHaveBeenCalledTimes(2))
  expect(db.produtos.count).not.toHaveBeenCalled()
  validation.resolve(category)
  const [created, transferred] = await Promise.all([creating, transferring])
  expect(created.status).toBe(201)
  expect(transferred.status).toBe(409)
  expect(db.categorias.update).not.toHaveBeenCalled()
})

it("transferência vencedora faz a criação concorrente revalidar a empresa", async () => {
  serialTransactions()
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  const category = {
    id: 3,
    id_empresa: 10,
    nome: "Tecidos",
    descricao: null,
    status: "ATIVA",
  }
  const counting = deferred<number>()
  db.categorias.findFirst.mockImplementation(async ({ where }) => {
    if (where.status === "ATIVA")
      return where.id_empresa === category.id_empresa ? category : null
    return category
  })
  db.produtos.count.mockReturnValue(counting.promise)
  db.empresas.findFirst.mockResolvedValue({ id: 20, status: "ATIVA" })
  db.categorias.update.mockImplementation(async ({ data }) => {
    Object.assign(category, data)
    return category
  })
  const transferring = categoryItem.PATCH(
    await request("/api/categorias/3", "PATCH", { id_empresa: 20 }),
    context("3"),
  )
  await vi.waitFor(() => expect(db.produtos.count).toHaveBeenCalledTimes(1))
  const creating = collection.POST(await request("/api/produtos", "POST", body))
  await vi.waitFor(() => expect(db.$transaction).toHaveBeenCalledTimes(2))
  expect(db.produtos.findFirst).not.toHaveBeenCalled()
  counting.resolve(0)
  const [transferred, created] = await Promise.all([transferring, creating])
  expect(transferred.status).toBe(200)
  expect(created.status).toBe(400)
  expect(db.produtos.create).not.toHaveBeenCalled()
})

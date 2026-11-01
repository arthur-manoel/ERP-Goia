import { beforeEach, expect, it } from "vitest"
import * as collection from "../../../src/app/api/categorias/route"
import * as item from "../../../src/app/api/categorias/[id]/route"
import {
  alterarStatusCategoria,
  listarCategorias,
  salvarCategoria,
} from "../../../src/features/categorias/api"
import { resetRateLimitsForTests } from "../../../src/lib/api/rate-limit"
import { db } from "../../helpers/prisma"
import { context, origin } from "../../helpers/http"
import { row } from "./fixtures"

let atual = { ...row }
beforeEach(() => {
  resetRateLimitsForTests()
  atual = { ...row }
  db.$queryRaw.mockImplementation(async (sql) =>
    sql.join("").includes("REGEXP_REPLACE") ? [] : [{ id: 10 }],
  )
  db.categorias.findFirst.mockImplementation(async () => ({ ...atual }))
  db.categorias.create.mockImplementation(async ({ data }) => {
    atual = { id: 1, ...data }
    return { ...atual }
  })
  db.categorias.update.mockImplementation(async ({ data }) => {
    atual = { ...atual, ...data }
    return { ...atual }
  })
  db.categorias.findMany.mockImplementation(async () => [{ ...atual }])
  db.categorias.count.mockResolvedValue(1)
  db.produtos.count.mockResolvedValue(2)
})

// Executa os handlers e serviços reais; somente autenticação e persistência
// usam os doubles isolados do projeto. Nenhum servidor ou banco é acessado.
async function requisitar(
  url: string,
  init: RequestInit = {},
  token = "test-token",
) {
  const headers = new Headers(init.headers)
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const req = new Request(origin + url, { ...init, headers })
  const id = new URL(req.url).pathname.split("/")[3]
  const response = id
    ? init.method === "DELETE"
      ? await item.DELETE(req, context(id))
      : await item.PATCH(req, context(id))
    : init.method === "POST"
      ? await collection.POST(req)
      : await collection.GET(req)
  expect(response.headers.get("Cache-Control")).toBe("no-store")
  return response
}

it("executa cadastro, edição, inativação com vínculos e reativação usando o contrato real do #110", async () => {
  const criada = await salvarCategoria(requisitar, 10, {
    nome: "  Tecidos   leves ",
    descricao: null,
  })
  expect(criada).toMatchObject({
    nome: "Tecidos leves",
    id_empresa: 10,
    status: "ATIVA",
    descricao: null,
  })
  const editada = await salvarCategoria(
    requisitar,
    10,
    { nome: "Tecidos leves", descricao: "Atualizada" },
    criada,
  )
  expect(editada.descricao).toBe("Atualizada")
  await alterarStatusCategoria(requisitar, 10, editada)
  expect(atual.status).toBe("INATIVA")
  expect(db.produtos.delete).not.toHaveBeenCalled()
  await alterarStatusCategoria(requisitar, 10, {
    ...editada,
    status: "INATIVA",
  })
  expect(atual.status).toBe("ATIVA")
  expect(db.categorias.delete).not.toHaveBeenCalled()
})

it("mantém busca e paginação no servidor e restringe a empresa mesmo com dois vínculos autorizados", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  const result = await listarCategorias(requisitar, 10, {
    busca: "  Malha  ",
    status: "ATIVA",
    pagina: 1,
  })
  expect(result.rows).toEqual([row])
  const query = db.categorias.findMany.mock.calls[0][0]
  expect(query).toMatchObject({
    skip: 0,
    take: 10,
    where: {
      AND: [
        { id_empresa: { in: [10] } },
        { status: "ATIVA" },
        { nome: { contains: "Malha" } },
      ],
    },
  })
})

it.each(["", "invalid-token"])(
  "não persiste sem Bearer válido (%s)",
  async (token) => {
    await expect(
      salvarCategoria((url, init) => requisitar(url, init, token), 10, {
        nome: "Tecidos",
        descricao: null,
      }),
    ).rejects.toThrow("Não autenticado")
    expect(db.categorias.create).not.toHaveBeenCalled()
  },
)

it("propaga permissão negada pela rota antes de gravar", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([])
  await expect(
    salvarCategoria(requisitar, 10, { nome: "Tecidos", descricao: null }),
  ).rejects.toThrow("Sem vínculo ativo ou permissão")
  expect(db.categorias.create).not.toHaveBeenCalled()
})

it("propaga o conflito real de nome e preserva a categoria existente", async () => {
  db.$queryRaw.mockImplementation(async (sql) =>
    sql.join("").includes("REGEXP_REPLACE") ? [row] : [{ id: 10 }],
  )
  await expect(
    salvarCategoria(requisitar, 10, { nome: row.nome, descricao: null }),
  ).rejects.toThrow("Já existe uma categoria ativa")
  expect(db.categorias.create).not.toHaveBeenCalled()
  expect(atual).toEqual(row)
})

import { beforeEach, expect, it } from "vitest"
import { db } from "../../helpers/prisma"
import { Prisma } from "../../../src/generated/prisma/client"
import { GET } from "../../../src/app/api/pedidos/disponibilidade/route"

const decimal = (v: number) => new Prisma.Decimal(v)
const posicao = (
  fisica: number,
  reservada: number,
  grade: [number, number, number][] = [],
) => ({
  quantidade: decimal(fisica),
  quantidade_reservada: decimal(reservada),
  estoque_variacao: grade.map(([id_variacao, q, r]) => ({
    id_variacao,
    quantidade: decimal(q),
    quantidade_reservada: decimal(r),
  })),
})
const consultar = (query = "idProduto=7", token = "test-token") =>
  GET(
    new Request(`http://localhost/api/pedidos/disponibilidade?${query}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Empresa-Id": "10" },
    }),
  )
beforeEach(() => {
  db.usuario_empresa.findFirst.mockResolvedValue({
    nivel_acesso: "EMPRESA",
    usuarios: {},
    permissoes_usuario: [],
  })
  db.produtos.findFirst.mockResolvedValue({ id: 7 })
  db.produto_variacoes.findFirst.mockResolvedValue({ id: 2 })
  db.estoque.findMany.mockResolvedValue([])
})
it("soma locais e desconta reservas sem abater pedidos fictícios", async () => {
  db.estoque.findMany.mockResolvedValue([posicao(10, 3), posicao(5, 2)])
  const r = await consultar()
  expect(r.status).toBe(200)
  expect((await r.json()).data).toEqual({
    fisica: "15.000",
    reservada: "5.000",
    disponivel: "10.000",
  })
  expect(r.headers.get("Cache-Control")).toBe("private, no-store")
  expect(db.estoque.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ id_empresa: 10, id_produto: 7 }),
    }),
  )
  expect(db.estoque.update).not.toHaveBeenCalled()
})
it("isola a variação e não promete estoque de outra grade", async () => {
  db.estoque.findMany.mockResolvedValue([
    posicao(20, 6, [
      [2, 8, 3],
      [3, 12, 3],
    ]),
  ])
  expect(
    (await (await consultar("idProduto=7&idVariacao=2")).json()).data
      .disponivel,
  ).toBe("5.000")
})
it("sem variação só oferece o saldo não identificado na grade", async () => {
  db.estoque.findMany.mockResolvedValue([posicao(20, 6, [[2, 8, 3]])])
  expect((await (await consultar()).json()).data).toEqual({
    fisica: "12.000",
    reservada: "3.000",
    disponivel: "9.000",
  })
})
it("ausência de posição resulta em zero", async () => {
  expect((await (await consultar()).json()).data.disponivel).toBe("0.000")
})
it("recusa inconsistência no agregado mesmo com variação aparentemente válida", async () => {
  db.estoque.findMany.mockResolvedValue([posicao(5, 1, [[2, 8, 1]])])
  expect((await consultar("idProduto=7&idVariacao=2")).status).toBe(409)
})
it("recusa variação fora do produto e produto fora da empresa", async () => {
  db.produto_variacoes.findFirst.mockResolvedValue(null)
  expect((await consultar("idProduto=7&idVariacao=2")).status).toBe(404)
  db.produtos.findFirst.mockResolvedValue(null)
  expect((await consultar()).status).toBe(404)
})
it("valida parâmetros e exige permissão nos dois recursos", async () => {
  expect((await consultar("idProduto=0")).status).toBe(400)
  db.usuario_empresa.findFirst.mockResolvedValue({
    nivel_acesso: "USUARIO",
    usuarios: {},
    permissoes_usuario: [{ recurso: "PEDIDOS", pode_ler: true }],
  })
  expect((await consultar()).status).toBe(403)
})

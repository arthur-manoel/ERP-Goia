import { expect, it } from "vitest"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import {
  contextoAuditoriaCatalogo,
  gravarCatalogo,
} from "../../../modules/catalogos/auditoria"
import { create as criarCor } from "../../../modules/cores/repository"
import { POST } from "../../../src/app/api/cores/route"
import { PATCH } from "../../../src/app/api/cores/[id]/route"
import type { Prisma } from "../../../src/generated/prisma/client"

const antes = {
  id: 7,
  id_empresa: 10,
  nome: "Azul",
  codigo_hex: "#0000FF",
  status: "ATIVA",
}
const depois = { ...antes, nome: "Azul marinho" }
it("grava autor da sessão e snapshots na mesma transação da alteração", async () => {
  db.cores.findUnique.mockResolvedValue(antes)
  db.cores.update.mockResolvedValue(depois)
  const response = await PATCH(
    await request("/api/cores/7", "PATCH", { nome: depois.nome }),
    context("7"),
  )
  expect(response.status).toBe(200)
  expect(db.$transaction).toHaveBeenCalledTimes(1)
  expect(db.$queryRaw).toHaveBeenCalled()
  expect(db.auditoria.create).toHaveBeenCalledWith({
    data: {
      id_empresa: 10,
      id_usuario: 1,
      tabela: "cores",
      id_registro: 7,
      acao: "UPDATE",
      dados_anteriores: JSON.stringify(antes),
      dados_novos: JSON.stringify(depois),
    },
  })
})
it("criação tem somente snapshot novo e falha do log rejeita a transação", async () => {
  db.cores.create.mockResolvedValue(antes)
  const response = await POST(
    await request("/api/cores", "POST", { id_empresa: 10, nome: "Azul" }),
  )
  expect(response.status).toBe(201)
  expect(db.auditoria.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        acao: "INSERT",
        dados_anteriores: null,
        id_usuario: 1,
      }),
    }),
  )
  db.auditoria.create.mockRejectedValue(new Error("Auditoria indisponível"))
  await expect(
    criarCor({ id_empresa: 10, nome: "Azul", status: "ATIVA" }),
  ).rejects.toThrow("Auditoria indisponível")
  // Propagar a rejeição faz o Prisma reverter a transação; o mock não simula rollback de MySQL.
  await expect(db.$transaction.mock.results.at(-1)?.value).rejects.toThrow(
    "Auditoria indisponível",
  )
})
it("reutiliza transação existente e evita evento para alteração sem efeito", async () => {
  db.cores.findUnique.mockResolvedValue(antes)
  const tx = db as unknown as Prisma.TransactionClient
  await gravarCatalogo("cores", 7, tx, async () => antes)
  expect(db.$transaction).not.toHaveBeenCalled()
  expect(db.auditoria.create).not.toHaveBeenCalled()
})
it("produto compartilhado gera evento em todos os proprietários, sem duplicar", async () => {
  db.produtos.findUnique.mockResolvedValue({ id: 7, nome: "Camisa" })
  db.produto_empresa.findMany.mockResolvedValue([
    { id_empresa: 10 },
    { id_empresa: 20 },
    { id_empresa: 10 },
  ])
  await contextoAuditoriaCatalogo.run({ idUsuario: 1, empresas: [10] }, () =>
    gravarCatalogo("produtos", 7, undefined, async () => ({
      id: 7,
      nome: "Camisa nova",
    })),
  )
  expect(
    db.auditoria.create.mock.calls.map(([args]) => args.data.id_empresa),
  ).toEqual([10, 20])
})
it("bloqueia todas as empresas do produto em ordem antes de bloquear o cadastro", async () => {
  db.produtos.findUnique.mockResolvedValue({ id: 7, nome: "Camisa" })
  db.produto_empresa.findMany.mockResolvedValue([
    { id_empresa: 20 },
    { id_empresa: 10 },
    { id_empresa: 20 },
  ])
  await contextoAuditoriaCatalogo.run({ idUsuario: 1, empresas: [20] }, () =>
    gravarCatalogo("produtos", 7, undefined, async () => ({
      id: 7,
      nome: "Camisa nova",
    })),
  )
  const [empresa, cadastro] = db.$queryRaw.mock.calls
  expect(empresa[0].join("")).toContain("FROM empresas")
  expect(empresa[1].values).toEqual([10, 20])
  expect(cadastro[0].join("")).toContain("FROM produtos")
  expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
    db.produtos.findUnique.mock.invocationCallOrder[0],
  )
})
it("transferência de categoria preserva evento nas empresas anterior e nova", async () => {
  db.categorias.findUnique.mockResolvedValue(antes)
  await gravarCatalogo("categorias", 7, undefined, async () => ({
    ...depois,
    id_empresa: 20,
  }))
  expect(
    db.auditoria.create.mock.calls.map(([args]) => args.data.id_empresa),
  ).toEqual([10, 20])
})
it("catálogo global recebe o contexto do autor sem misturar requisições concorrentes", async () => {
  await Promise.all(
    [10, 20].map((empresa) =>
      contextoAuditoriaCatalogo.run(
        { idUsuario: empresa, empresas: [empresa] },
        async () => {
          await Promise.resolve()
          return gravarCatalogo("tipos_produto", null, undefined, async () => ({
            id: empresa,
            nome: "Tipo",
          }))
        },
      ),
    ),
  )
  expect(
    db.auditoria.create.mock.calls.map(([args]) => [
      args.data.id_empresa,
      args.data.id_usuario,
    ]),
  ).toEqual(
    expect.arrayContaining([
      [10, 10],
      [20, 20],
    ]),
  )
})
it("rejeita JSON maior que TEXT antes de gravar o histórico", async () => {
  await expect(
    gravarCatalogo("cores", null, undefined, async () => ({
      ...antes,
      nome: "👕".repeat(20_000),
    })),
  ).rejects.toThrow(/65.535 bytes/)
  expect(db.auditoria.create).not.toHaveBeenCalled()
})

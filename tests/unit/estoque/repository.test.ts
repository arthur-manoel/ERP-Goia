import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import { db } from "../../helpers/prisma"
import {
  criarVinculoEstoque,
  detalharEstoque,
  listarEstoque,
} from "../../../src/modules/estoque/estoque.repository"
import { filtrosEstoqueSchema } from "../../../src/modules/estoque/estoque.schema"

vi.mock("server-only", () => ({}))

const body = { idProduto: 3, idLocalEstoque: 2, idSetor: 4 }
const contexto = { idUsuario: 1, idEmpresa: 10 }
const referencia = { id: 100, id_produto: 3, id_local_estoque: 2, id_setor: 4 }
beforeEach(() => {
  db.locais_estoque.findFirst.mockResolvedValue({ id: 2, status: "ATIVO" })
  db.setores.findFirst.mockResolvedValue({ id: 4, status: "ATIVO" })
  db.produto_empresa.findUnique.mockResolvedValue({
    status: "ATIVO",
    produtos: { status: "ATIVO", controla_estoque: true },
  })
  db.estoque.findFirst.mockResolvedValue(null)
  db.estoque.create.mockResolvedValue(referencia)
  db.auditoria.create.mockResolvedValue({ id: 1 })
})

it("duas consultas no mesmo snapshot, LIMIT no banco e busca parametrizada", async () => {
  db.$queryRaw
    .mockResolvedValueOnce([{ registros: BigInt(80) }])
    .mockResolvedValueOnce([])
  const busca = "' OR 1=1 -- %_"
  const result = await listarEstoque(
    10,
    filtrosEstoqueSchema.parse({
      id_produto: "3",
      id_local_estoque: "2",
      id_setor: "4",
      busca,
      incluir_zerados: "false",
      pagina: "2",
      limite: "10",
    }),
  )
  expect(result.paginacao).toMatchObject({
    totalRegistros: 80,
    totalPaginas: 8,
  })
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "RepeatableRead",
  })
  expect(db.$queryRaw).toHaveBeenCalledTimes(2)
  for (const [sql] of db.$queryRaw.mock.calls as [Prisma.Sql][]) {
    expect(sql.values).toEqual(expect.arrayContaining([10, 3, 2, 4, busca]))
    expect(sql.sql).not.toContain(busca)
    expect(sql.sql).toContain("e.quantidade <> 0")
    expect(sql.sql).toContain("l.id_empresa = e.id_empresa")
    expect(sql.sql).toContain("s.id_empresa = e.id_empresa")
    expect(sql.sql).toContain("pe.id_empresa = e.id_empresa")
    expect(sql.sql).not.toMatch(/FOR UPDATE|INSERT|UPDATE |DELETE/)
  }
  const pagina = db.$queryRaw.mock.calls[1][0] as Prisma.Sql
  expect(pagina.sql).toContain("ORDER BY e.id ASC")
  expect(pagina.sql).toContain("LIMIT ? OFFSET ?")
  expect(pagina.values.slice(-2)).toEqual([10, 10])
})

it("detalhe preserva decimais, negativos e inativos sem custos", async () => {
  db.$queryRaw.mockResolvedValue([
    {
      idEstoque: 100,
      idProduto: 3,
      produto: "Tecido",
      codigo: "T",
      codigoInterno: null,
      unidade: "M",
      statusProduto: "INATIVO",
      statusNaEmpresa: "INATIVO",
      idLocal: 2,
      local: "Local",
      statusLocal: "INATIVO",
      idSetor: 4,
      setor: "Setor",
      statusSetor: "INATIVO",
      fisica: new Prisma.Decimal("150.125"),
      reservada: new Prisma.Decimal("151.126"),
      disponivel: new Prisma.Decimal("-1.001"),
      atualizadoEm: new Date("2026-01-01T12:00:00Z"),
    },
  ])
  const result = await detalharEstoque(10, 100)
  expect(result).toMatchObject({
    quantidadeFisica: "150.125",
    quantidadeReservada: "151.126",
    quantidadeDisponivel: "-1.001",
    atualizadoEm: "2026-01-01T12:00:00.000Z",
  })
  expect(JSON.stringify(result)).not.toMatch(/preco|custo|fornecedor/)
  db.$queryRaw.mockResolvedValue([])
  await expect(detalharEstoque(10, 200)).rejects.toMatchObject({ status: 404 })
})

it("cria zero e auditoria dentro da mesma transação sem movimentos", async () => {
  expect(await criarVinculoEstoque(contexto, body)).toEqual({
    idEstoque: 100,
    ...body,
    criado: true,
  })
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "Serializable",
  })
  expect(db.estoque.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: {
        id_empresa: 10,
        id_produto: 3,
        id_local_estoque: 2,
        id_setor: 4,
        quantidade: "0.000",
        quantidade_reservada: "0.000",
      },
    }),
  )
  expect(db.auditoria.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        id_usuario: 1,
        id_empresa: 10,
        tabela: "estoque",
        id_registro: 100,
        acao: "INSERT",
      }),
    }),
  )
})

it("repetição não altera posição ou auditoria mesmo após inativação", async () => {
  db.estoque.findFirst.mockResolvedValue(referencia)
  db.locais_estoque.findFirst.mockResolvedValue({ id: 2, status: "INATIVO" })
  expect(await criarVinculoEstoque(contexto, body)).toEqual({
    idEstoque: 100,
    ...body,
    criado: false,
  })
  expect(db.estoque.create).not.toHaveBeenCalled()
  expect(db.estoque.update).not.toHaveBeenCalled()
  expect(db.auditoria.create).not.toHaveBeenCalled()
})

it.each([
  { ...referencia, id_setor: 9 },
  { ...referencia, id_local_estoque: 9 },
])("respeita as duas unicidades %j", async (existente) => {
  db.estoque.findFirst.mockResolvedValue(existente)
  await expect(criarVinculoEstoque(contexto, body)).rejects.toMatchObject({
    status: 409,
  })
  expect(db.estoque.create).not.toHaveBeenCalled()
})

it("não confirma produto global fora da empresa", async () => {
  db.produto_empresa.findUnique.mockResolvedValue(null)
  await expect(criarVinculoEstoque(contexto, body)).rejects.toMatchObject({
    status: 404,
  })
  expect(db.produtos.findUnique).not.toHaveBeenCalled()
})

it.each(["P2002", "P2034"])(
  "retry %s usa transação nova e retorna o vencedor",
  async (code) => {
    db.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("disputa", {
        code,
        clientVersion: "test",
      }),
    )
    db.estoque.findFirst.mockResolvedValue(referencia)
    expect((await criarVinculoEstoque(contexto, body)).criado).toBe(false)
    expect(db.$transaction).toHaveBeenCalledTimes(2)
    expect(db.estoque.create).not.toHaveBeenCalled()
  },
)

it("falha de auditoria propaga e não é considerada sucesso", async () => {
  db.auditoria.create.mockRejectedValue(new Error("audit failed"))
  await expect(criarVinculoEstoque(contexto, body)).rejects.toThrow(
    "audit failed",
  )
})

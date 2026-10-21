import { beforeEach, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import { db } from "../../helpers/prisma"
import { consultarRelatorio } from "../../../src/modules/relatorio-estoque/relatorio-estoque.repository"
import { filtrosRelatorioSchema } from "../../../src/modules/relatorio-estoque/relatorio-estoque.schema"
import { relatorioEstoqueHandler } from "../../../src/modules/relatorio-estoque/router"
import { autorizarEstoque } from "../../../src/modules/estoque-minimo/estoque-minimo.authorization"
import { EstoqueMinimoError } from "../../../src/modules/estoque-minimo/estoque-minimo.error"

vi.mock("server-only", () => ({}))
vi.mock(
  "../../../src/modules/estoque-minimo/estoque-minimo.authorization",
  () => ({ autorizarEstoque: vi.fn() }),
)
const query = vi.fn()
beforeEach(() => {
  db.$transaction.mockImplementation(async (run) => run({ $queryRaw: query }))
  vi.mocked(autorizarEstoque).mockResolvedValue({
    idUsuario: 1,
    idEmpresa: 10,
    podeEditar: false,
  })
})
const request = (query = "") =>
  new Request(`http://localhost/api/relatorios/estoque/produtos?${query}`)
const vazio = () =>
  query
    .mockResolvedValueOnce([
      { registros: BigInt(0), produtos: BigInt(0), locais: BigInt(0) },
    ])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])

it("parametriza entradas; três consultas paginadas no mesmo snapshot, sem N+1", async () => {
  vazio()
  const busca = "' OR 1=1 -- %_"
  await consultarRelatorio(
    10,
    filtrosRelatorioSchema.parse({
      busca,
      id_local_estoque: "2",
      id_produto: "3",
      incluir_zerados: "false",
      pagina: "2",
      limite: "10",
      ordenar_por: "quantidade_fisica",
      direcao: "desc",
    }),
  )
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
    isolationLevel: "RepeatableRead",
  })
  expect(query).toHaveBeenCalledTimes(3)
  const consultas = query.mock.calls.map(([sql]) => sql as Prisma.Sql)
  for (const sql of consultas) {
    expect(sql.sql).toContain("e.id_empresa = ?")
    expect(sql.sql).toContain("e.quantidade <> 0")
    expect(sql.values).toEqual(expect.arrayContaining([10, 2, 3, busca]))
    expect(sql.sql).not.toContain(busca)
    expect(sql.sql).not.toMatch(/FOR UPDATE|INSERT|DELETE|UPDATE /)
  }
  expect(consultas[1].sql).toContain(
    "ORDER BY e.quantidade DESC, l.id ASC, p.id ASC, e.id ASC",
  )
  expect(consultas[1].sql).toContain("LIMIT ? OFFSET ?")
  expect(consultas[2].sql).toContain("GROUP BY l.id, BINARY p.unidade")
})

it("serializa decimais negativos, datas reais e metadados fora da página", async () => {
  const saldo = {
    fisica: new Prisma.Decimal("150.125"),
    reservada: new Prisma.Decimal("151.126"),
    disponivel: new Prisma.Decimal("-1.001"),
  }
  query
    .mockResolvedValueOnce([
      { registros: BigInt(80), produtos: BigInt(40), locais: BigInt(2) },
    ])
    .mockResolvedValueOnce([
      {
        ...saldo,
        idLocal: 2,
        local: "Inativo",
        statusLocal: "INATIVO",
        idProduto: 3,
        produto: "Tecido",
        codigo: "T",
        codigoInterno: null,
        unidade: "M",
        statusProduto: "INATIVO",
        statusProdutoEmpresa: "INATIVO",
        atualizadoEm: new Date("2026-01-01T12:00:00Z"),
      },
    ])
    .mockResolvedValueOnce([{ ...saldo, idLocalEstoque: 2, unidade: "M" }])
  const response = await relatorioEstoqueHandler(request())
  expect(response.status).toBe(200)
  expect(response.headers.get("Cache-Control")).toBe("private, no-store")
  const result = await response.json()
  expect(result.dados[0]).toMatchObject({
    quantidadeFisica: "150.125",
    quantidadeReservada: "151.126",
    quantidadeDisponivel: "-1.001",
    atualizadoEm: "2026-01-01T12:00:00.000Z",
  })
  expect(result.paginacao).toMatchObject({
    totalRegistros: 80,
    totalPaginas: 4,
  })
  expect(result.resumo.totalProdutosDistintos).toBe(40)
})

it("preserva todas as casas de agregados maiores que a precisão padrão do Decimal", async () => {
  query
    .mockResolvedValueOnce([
      { registros: BigInt(0), produtos: BigInt(0), locais: BigInt(0) },
    ])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([
      {
        idLocalEstoque: 2,
        unidade: "UN",
        fisica: new Prisma.Decimal("999999999999999999999.999"),
        reservada: new Prisma.Decimal("0.001"),
        disponivel: new Prisma.Decimal("999999999999999999999.998"),
      },
    ])
  const result = await consultarRelatorio(10, filtrosRelatorioSchema.parse({}))
  expect(result.resumo.porLocalEUnidade[0].quantidadeDisponivel).toBe(
    "999999999999999999999.998",
  )
  expect((query.mock.calls[2][0] as Prisma.Sql).sql).toContain(
    "SUM(e.quantidade) - SUM(e.quantidade_reservada)",
  )
})

it("erro de banco é genérico e privado", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  db.$transaction.mockRejectedValue(
    new Error("SELECT segredo; mysql://credencial"),
  )
  const response = await relatorioEstoqueHandler(request())
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({
    error: "Não foi possível consultar o relatório de estoque.",
  })
  expect(response.headers.get("Cache-Control")).toBe("private, no-store")
})

it("não consulta o saldo para filtros inválidos", async () => {
  expect((await relatorioEstoqueHandler(request("id_empresa=20"))).status).toBe(
    400,
  )
  expect(query).not.toHaveBeenCalled()
})

it.each([401, 403])(
  "preserva recusa %i sem cache compartilhado",
  async (status) => {
    if (status === 401)
      vi.mocked(autorizarEstoque).mockResolvedValue(
        Response.json({ error: "Não autenticado" }, { status }),
      )
    else
      vi.mocked(autorizarEstoque).mockRejectedValue(
        new EstoqueMinimoError(status, "Acesso negado ao estoque."),
      )
    const response = await relatorioEstoqueHandler(request())
    expect(response.status).toBe(status)
    expect(response.headers.get("Cache-Control")).toBe("private, no-store")
    expect(query).not.toHaveBeenCalled()
  },
)

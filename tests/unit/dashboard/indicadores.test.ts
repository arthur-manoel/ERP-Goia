import { describe, it, expect, vi, afterEach } from "vitest"
import { db } from "../../helpers/prisma"
import { Prisma } from "@/generated/prisma/client"
import {
  consultarOrdensProducaoAbertas,
  consultarPedidosAEntregar,
  consultarSaldoDoMes,
  diaDoERP,
} from "@/lib/dashboard/indicadores-reais"
import { GET } from "@/app/api/dashboard/[indicador]/route"

afterEach(() => vi.useRealTimers())
const request = (indicador: string, token = "test-token", empresa = "10") =>
  GET(
    new Request(`http://localhost/api/dashboard/${indicador}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Empresa-Id": empresa },
    }),
    { params: Promise.resolve({ indicador }) },
  )
const vinculo = (recurso: string, pode_ler = true) => ({
  id_empresa: 10,
  nivel_acesso: "USUARIO",
  usuarios: { nivel_acesso: "USUARIO" },
  permissoes_usuario: [{ recurso, pode_ler }],
})

describe("indicadores reais da dashboard", () => {
  it("usa a data civil de Fortaleza na virada do dia", () => {
    expect(diaDoERP(new Date("2026-11-15T01:00:00Z")).toISOString()).toBe(
      "2026-11-14T00:00:00.000Z",
    )
  })
  it("separa atrasados, hoje, próximos sete dias e pedidos sem prazo", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-15T15:00:00Z"))
    db.pedido_cliente.findMany.mockResolvedValue(
      [
        "2026-11-12",
        "2026-11-15",
        "2026-11-16",
        "2026-11-22",
        "2026-11-23",
        null,
      ].map((d) => ({
        data_previsao_entrega: d ? new Date(`${d}T12:00:00Z`) : null,
      })),
    )
    expect(await consultarPedidosAEntregar(10)).toEqual({
      total: 6,
      atrasados: 1,
      vencemHoje: 1,
      proximos: { quantidade: 2, janelaDias: 7 },
      maiorAtrasoEmDias: 3,
    })
    expect(db.pedido_cliente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_empresa: 10,
          status: {
            in: [
              "CONFIRMADO",
              "EM_PRODUCAO",
              "PRONTO",
              "EM_ENTREGA",
              "PARCIALMENTE_ENTREGUE",
            ],
          },
        },
      }),
    )
  })
  it("conta OPs abertas por status e considera apenas prazos anteriores a hoje", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-15T15:00:00Z"))
    db.ordem_producao.findMany.mockResolvedValue([
      { status: "PLANEJADA", data_previsao: null },
      { status: "EM_PRODUCAO", data_previsao: new Date("2026-11-14") },
      { status: "EM_PRODUCAO", data_previsao: new Date("2026-11-15") },
    ])
    expect(await consultarOrdensProducaoAbertas(10)).toEqual({
      total: 3,
      atrasadas: 1,
      porStatus: [
        { rotulo: "Planejada", quantidade: 1 },
        { rotulo: "Em produção", quantidade: 2 },
      ],
    })
    expect(db.ordem_producao.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_empresa: 10,
          status: { notIn: ["CONCLUIDA", "CANCELADA"] },
        },
      }),
    )
  })
  it("calcula saldo com precisão decimal e restringe mês, empresa e transferências", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-12-01T01:00:00Z"))
    db.movimentacoes_financeiras.groupBy.mockResolvedValue([
      { tipo: "ENTRADA", _sum: { valor: new Prisma.Decimal("0.10") } },
      { tipo: "SAIDA", _sum: { valor: new Prisma.Decimal("0.30") } },
    ])
    expect(await consultarSaldoDoMes(10)).toEqual({
      valor: "-0.20",
      entradas: "0.10",
      saidas: "0.30",
    })
    expect(db.movimentacoes_financeiras.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id_empresa: 10,
          data_movimentacao: {
            gte: new Date("2026-11-01T03:00:00Z"),
            lt: new Date("2026-12-01T03:00:00Z"),
          },
          origem: { not: "TRANSFERENCIA" },
        },
      }),
    )
  })
  it("devolve zero em mês sem movimentos", async () => {
    db.movimentacoes_financeiras.groupBy.mockResolvedValue([])
    expect(await consultarSaldoDoMes(10)).toEqual({
      valor: "0.00",
      entradas: "0.00",
      saidas: "0.00",
    })
  })
  it("nega usuário anônimo, perfil indevido, empresa alheia e falta de permissão antes de consultar", async () => {
    expect((await request("saldo", "invalid")).status).toBe(401)
    expect((await request("saldo", "production-token")).status).toBe(403)
    db.usuario_empresa.findMany.mockResolvedValue([vinculo("FINANCEIRO")])
    expect((await request("saldo", "test-token", "99")).status).toBe(403)
    db.usuario_empresa.findMany.mockResolvedValue([
      vinculo("FINANCEIRO", false),
    ])
    expect((await request("saldo")).status).toBe(403)
    expect(db.movimentacoes_financeiras.groupBy).not.toHaveBeenCalled()
  })
  it.each([
    ["ordens", "ORDENS_PRODUCAO", "production-token"],
    ["pedidos", "PEDIDOS", "test-token"],
    ["saldo", "FINANCEIRO", "finance-token"],
  ])(
    "restringe %s à leitura do próprio recurso",
    async (indicador, recurso, token) => {
      db.usuario_empresa.findMany.mockResolvedValue([vinculo(recurso, false)])
      expect((await request(indicador, token)).status).toBe(403)
      db.usuario_empresa.findMany.mockResolvedValue([vinculo(recurso)])
      db.ordem_producao.findMany.mockResolvedValue([])
      db.pedido_cliente.findMany.mockResolvedValue([])
      db.movimentacoes_financeiras.groupBy.mockResolvedValue([])
      expect((await request(indicador, token)).status).toBe(200)
      expect(db.usuario_empresa.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            id_usuario: expect.any(Number),
            status: "ATIVO",
            usuarios: { status: "ATIVO" },
            empresas: { status: "ATIVA" },
          },
        }),
      )
    },
  )
  it("rejeita indicador inexistente sem consultar o banco", async () => {
    expect((await request("__proto__")).status).toBe(404)
    expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
  })
  it("exige seleção explícita com múltiplos vínculos e rejeita headers inválidos", async () => {
    db.usuario_empresa.findMany.mockResolvedValue([
      vinculo("PEDIDOS"),
      { ...vinculo("PEDIDOS"), id_empresa: 20 },
    ])
    const response = await GET(
      new Request("http://localhost/api/dashboard/pedidos", {
        headers: { Authorization: "Bearer test-token" },
      }),
      { params: Promise.resolve({ indicador: "pedidos" }) },
    )
    expect(response.status).toBe(400)
    for (const empresa of ["0", "-1", "10.0", "10e0", "2147483648"])
      expect((await request("pedidos", "test-token", empresa)).status).toBe(403)
    expect(db.pedido_cliente.findMany).not.toHaveBeenCalled()
  })
  it("isola falhas de banco e não expõe detalhes técnicos", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    db.usuario_empresa.findMany.mockResolvedValue([vinculo("PEDIDOS")])
    db.pedido_cliente.findMany.mockRejectedValue(
      new Error("Credencial interna do banco"),
    )
    const response = await request("pedidos")
    expect(await response.json()).toEqual({
      success: true,
      data: { estado: "erro" },
    })
  })
  it("entrega somente dados autorizados e impede cache da resposta", async () => {
    db.usuario_empresa.findMany.mockResolvedValue([vinculo("FINANCEIRO")])
    db.movimentacoes_financeiras.groupBy.mockResolvedValue([])
    const response = await request("saldo")
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(await response.json()).toEqual({
      success: true,
      data: {
        estado: "ok",
        dados: { valor: "0.00", entradas: "0.00", saidas: "0.00" },
      },
    })
  })
})

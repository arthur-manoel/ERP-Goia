import { beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "../../../src/generated/prisma/client"
import { requireRole } from "../../../src/lib/authorize"
import { autorizar } from "../../../src/modules/movimentacoes-estoque/movimentacoes-estoque.authorization"
import { calcularSaldo } from "../../../src/modules/movimentacoes-estoque/movimentacoes-estoque.service"
import {
  ajusteSchema,
  movimentoSchema,
  saldoSchema,
} from "../../../src/modules/movimentacoes-estoque/movimentacoes-estoque.schema"
import {
  entradaHandler,
  ajusteHandler,
  saldoHandler,
} from "../../../src/modules/movimentacoes-estoque/router"
import {
  movimentar,
  consultarSaldo,
} from "../../../src/modules/movimentacoes-estoque/movimentacoes-estoque.repository"
import { db } from "../../helpers/prisma"

vi.mock("server-only", () => ({}))
vi.mock("../../../src/lib/authorize", () => ({ requireRole: vi.fn() }))
vi.mock(
  "../../../src/modules/movimentacoes-estoque/movimentacoes-estoque.repository",
  () => ({ movimentar: vi.fn(), consultarSaldo: vi.fn() }),
)
const vinculos = vi.fn()
const payload = {
  idProduto: 1,
  idLocalEstoque: 2,
  idSetor: 3,
  quantidade: "0.001",
  observacao: "Recebimento manual",
}
const request = (body: unknown = payload, empresa = "10") =>
  new Request("http://localhost/api/estoque/entradas", {
    method: "POST",
    headers: { "X-Empresa-Id": empresa, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
const vinculo = (id_empresa = 10, admin = false) => ({
  id_empresa,
  nivel_acesso: "USUARIO",
  usuarios: { nivel_acesso: admin ? "ADMIN" : "USUARIO" },
  permissoes_usuario: [
    { pode_ler: true, pode_criar: true, pode_editar: false },
  ],
})
beforeEach(() => {
  Object.assign(db, { usuario_empresa: { findMany: vinculos } })
  vi.mocked(requireRole).mockResolvedValue({
    user: { id: 5, role: "PRODUCAO" },
  })
  vinculos.mockResolvedValue([vinculo()])
  vi.mocked(movimentar).mockResolvedValue({ idMovimentacao: 1 } as Awaited<
    ReturnType<typeof movimentar>
  >)
  vi.mocked(consultarSaldo).mockResolvedValue({ saldo: "0.001" } as Awaited<
    ReturnType<typeof consultarSaldo>
  >)
})
describe("decimais e contrato", () => {
  it.each([
    "-1",
    "0",
    "0.000",
    "1.0001",
    "1e3",
    "1000000000000",
    "NaN",
    Infinity,
    null,
  ])("rejeita quantidade inválida %s", (quantidade) => {
    expect(movimentoSchema.safeParse({ ...payload, quantidade }).success).toBe(
      false,
    )
  })
  it("rejeita campos de identidade, origem, tipos e IDs injetados", () => {
    for (const key of [
      "idEmpresa",
      "idUsuario",
      "tipo",
      "origem_id",
      "valor_total",
    ])
      expect(movimentoSchema.safeParse({ ...payload, [key]: 1 }).success).toBe(
        false,
      )
    expect(
      movimentoSchema.safeParse({ ...payload, idProduto: "1 OR 1=1" }).success,
    ).toBe(false)
    expect(
      saldoSchema.safeParse({ idProduto: "1e2", idLocalEstoque: "2" }).success,
    ).toBe(false)
  })
  it("aceita ajuste para zero, exige saldo esperado e motivo", () => {
    const dados = {
      idProduto: 1,
      idLocalEstoque: 2,
      idSetor: 3,
      saldoNovo: "0",
      saldoEsperado: "1",
      observacao: "Inventário",
    }
    expect(ajusteSchema.safeParse(dados).success).toBe(true)
    expect(
      ajusteSchema.safeParse({ ...dados, saldoEsperado: undefined }).success,
    ).toBe(false)
    expect(ajusteSchema.safeParse({ ...dados, observacao: " " }).success).toBe(
      false,
    )
  })
  it("preserva precisão no limite e impede saldo negativo e overflow", () => {
    expect(
      calcularSaldo(
        new Prisma.Decimal("999999999999.998"),
        "0.001",
        "entrada",
      ).atual.toFixed(3),
    ).toBe("999999999999.999")
    expect(() =>
      calcularSaldo(new Prisma.Decimal("999999999999.999"), "0.001", "entrada"),
    ).toThrow("capacidade")
    expect(() =>
      calcularSaldo(new Prisma.Decimal("0.001"), "0.002", "saida"),
    ).toThrow("insuficiente")
    expect(
      calcularSaldo(
        new Prisma.Decimal("0.001"),
        "0.001",
        "saida",
      ).atual.toFixed(3),
    ).toBe("0.000")
    expect(() =>
      calcularSaldo(new Prisma.Decimal(2), "0", "ajuste", "1"),
    ).toThrow("mudou")
    expect(() =>
      calcularSaldo(new Prisma.Decimal(2), "2", "ajuste", "2"),
    ).toThrow("não altera")
  })
})
describe("autorização e handlers", () => {
  it("exige token antes de consultar banco e protege cache", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      error: Response.json({ error: "Não autenticado" }, { status: 401 }),
    })
    const response = await entradaHandler(request())
    expect(response.status).toBe(401)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(vinculos).not.toHaveBeenCalled()
    expect(movimentar).not.toHaveBeenCalled()
  })
  it("admin não acessa empresa sem vínculo", async () => {
    vinculos.mockResolvedValue([vinculo(10, true)])
    expect((await entradaHandler(request(payload, "20"))).status).toBe(403)
    expect(movimentar).not.toHaveBeenCalled()
  })
  it("exige seleção quando há mais de uma empresa e filtra status no banco", async () => {
    vinculos.mockResolvedValue([vinculo(), vinculo(20)])
    await expect(
      autorizar(new Request("http://localhost"), "ler"),
    ).rejects.toMatchObject({ status: 400 })
    expect(vinculos).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ATIVO",
          empresas: { status: "ATIVA" },
          usuarios: { status: "ATIVO" },
        }),
      }),
    )
  })
  it("separa criação de edição e leitura", async () => {
    expect((await entradaHandler(request())).status).toBe(201)
    expect(movimentar).toHaveBeenCalledWith(
      { idUsuario: 5, idEmpresa: 10 },
      payload,
      "entrada",
    )
    expect(
      (
        await ajusteHandler(
          request({
            idProduto: 1,
            idLocalEstoque: 2,
            idSetor: 3,
            saldoNovo: "0",
            saldoEsperado: "1",
            observacao: "Inventário",
          }),
        )
      ).status,
    ).toBe(403)
  })
  it("nega vínculo inexistente, token com ID inválido e permissão ausente", async () => {
    vinculos.mockResolvedValue([])
    expect((await entradaHandler(request())).status).toBe(403)
    vi.mocked(requireRole).mockResolvedValue({
      user: { id: "abc", role: "PRODUCAO" },
    })
    expect((await entradaHandler(request())).status).toBe(401)
  })
  it("rejeita JSON malformado, campos extras e filtros repetidos", async () => {
    expect(
      (
        await entradaHandler(
          new Request("http://localhost", { method: "POST", body: "{" }),
        )
      ).status,
    ).toBe(400)
    expect(
      (await entradaHandler(request({ ...payload, idEmpresa: 20 }))).status,
    ).toBe(400)
    expect(
      (
        await saldoHandler(
          new Request(
            "http://localhost/api/estoque/saldo?idProduto=1&idProduto=2&idLocalEstoque=2",
          ),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await saldoHandler(
          new Request(
            "http://localhost/api/estoque/saldo?idProduto=1&idLocalEstoque=2",
          ),
        )
      ).status,
    ).toBe(200)
  })
  it("não expõe detalhes internos", async () => {
    vi.mocked(movimentar).mockRejectedValue(new Error("senha-do-banco"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await entradaHandler(request())
    expect(response.status).toBe(500)
    expect(await response.text()).not.toContain("senha-do-banco")
  })
})

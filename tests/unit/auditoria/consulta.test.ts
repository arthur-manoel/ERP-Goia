import { beforeEach, expect, it } from "vitest"
import { db } from "../../helpers/prisma"
import { request } from "../../helpers/http"
import { GET } from "../../../src/app/api/auditoria/route"
import {
  filtrosAuditoria,
  lerSnapshot,
  periodoAuditoria,
} from "../../../src/modules/auditoria/schema"

beforeEach(() => {
  db.usuario_empresa.findFirst.mockResolvedValue({
    nivel_acesso: "EMPRESA",
    usuarios: { nivel_acesso: "USUARIO" },
  })
  db.auditoria.findMany.mockResolvedValue([])
  db.auditoria.count.mockResolvedValue(0)
})
async function consultar(
  query = "",
  token = "test-token",
  empresa: string | null = "10",
) {
  const req = await request(`/api/auditoria${query}`)
  req.headers.set("Authorization", `Bearer ${token}`)
  if (empresa !== null) req.headers.set("X-Empresa-Id", empresa)
  return GET(req)
}
it("exige sessão válida antes de acessar o banco", async () => {
  const response = await consultar("", "invalid")
  expect(response.status).toBe(401)
  expect(response.headers.get("Cache-Control")).toBe("no-store")
  expect(db.$transaction).not.toHaveBeenCalled()
})
it("revalida vínculo e administração mesmo com JWT administrativo", async () => {
  for (const vinculo of [
    null,
    { nivel_acesso: "USUARIO", usuarios: { nivel_acesso: "USUARIO" } },
  ]) {
    db.usuario_empresa.findFirst.mockResolvedValue(vinculo)
    expect((await consultar()).status).toBe(403)
  }
  expect(db.auditoria.findMany).not.toHaveBeenCalled()
  expect(db.usuario_empresa.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id_usuario: 1,
        id_empresa: 10,
        status: "ATIVO",
        empresas: { status: "ATIVA" },
        usuarios: { status: "ATIVO" },
      },
    }),
  )
})
it.each([null, "0", "abc", "10.5", "2147483648", "9007199254740991"])(
  "rejeita seleção de empresa inválida: %s",
  async (empresa) => {
    expect((await consultar("", "test-token", empresa)).status).toBe(400)
    expect(db.auditoria.findMany).not.toHaveBeenCalled()
  },
)
it.each([
  "?inicio=2026-02-30",
  "?inicio=2026-11-12&fim=2026-11-11",
  "?pagina=0",
  "?usuario=-1",
  "?registro=2147483648",
  "?pagina=1&pagina=2",
  "?id_empresa=20",
  "?acao=OUTRA",
  "?pagina=2",
  "?pagina=2&cursor=invalido",
  "?pagina=2&cursor=2026-11-11T03:00:00.000Z%7C2147483648",
])("rejeita filtro inválido %s", async (query) => {
  expect((await consultar(query)).status).toBe(400)
  expect(db.auditoria.findMany).not.toHaveBeenCalled()
})
it("aplica filtros e paginação no banco sem permitir trocar o escopo", async () => {
  db.auditoria.count.mockResolvedValue(28)
  const response = await consultar(
    "?inicio=2026-11-01&fim=2026-11-11&usuario=3&tabela=produtos&registro=7&acao=UPDATE&pagina=2&cursor=2026-11-10T03:00:00.000Z%7C100",
  )
  expect(response.status).toBe(200)
  const where = {
    id_empresa: 10,
    id_usuario: 3,
    tabela: "produtos",
    id_registro: 7,
    acao: "UPDATE",
    data_evento: {
      gte: new Date("2026-11-01T03:00:00Z"),
      lt: new Date("2026-11-12T03:00:00Z"),
    },
  }
  expect(db.auditoria.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        ...where,
        OR: [
          { data_evento: { lt: new Date("2026-11-10T03:00:00.000Z") } },
          {
            data_evento: new Date("2026-11-10T03:00:00.000Z"),
            id: { lt: 100 },
          },
        ],
      },
      take: 26,
      orderBy: [{ data_evento: "desc" }, { id: "desc" }],
    }),
  )
  expect(db.auditoria.count).toHaveBeenCalledWith({ where })
  expect(await response.json()).toMatchObject({
    total: 28,
    pagina: 2,
    totalPaginas: 2,
  })
})
it("gera cursor pelo último item exibido e usa desempate por ID", async () => {
  const data = new Date("2026-11-11T12:00:00.000Z")
  db.auditoria.findMany.mockResolvedValue(
    Array.from({ length: 26 }, (_, i) => ({
      id: 100 - i,
      id_empresa: 10,
      data_evento: data,
      dados_anteriores: null,
      dados_novos: null,
      usuarios: null,
    })),
  )
  db.auditoria.count.mockResolvedValue(30)
  const body = await (await consultar()).json()
  expect(body.itens).toHaveLength(25)
  expect(body.proximoCursor).toBe("2026-11-11T12:00:00.000Z|76")
  expect(db.auditoria.findMany.mock.calls[0][0]).not.toHaveProperty("skip")
})
it("exibe snapshots seguros e suporta eventos sem usuário ou dados anteriores", async () => {
  db.auditoria.findMany.mockResolvedValue([
    {
      id: 1,
      id_empresa: 10,
      tabela: "usuarios",
      dados_anteriores: null,
      dados_novos: JSON.stringify({
        nome: "Maria",
        senha_hash: "segredo",
        nested: [{ refresh_token: "secreto" }],
      }),
      usuarios: null,
    },
  ])
  const response = await consultar()
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.itens[0]).toMatchObject({
    usuario: "Sistema / usuário removido",
    antes: null,
    depois: {
      nome: "Maria",
      senha_hash: "[oculto]",
      nested: [{ refresh_token: "[oculto]" }],
    },
  })
  expect(JSON.stringify(body)).not.toMatch(/segredo|secreto|dados_novos/)
})
it("retorna erro genérico sem vazar detalhes do banco", async () => {
  db.auditoria.findMany.mockRejectedValue(new Error("credencial privada"))
  const response = await consultar()
  expect(response.status).toBe(500)
  expect(JSON.stringify(await response.json())).not.toContain("credencial")
})
it("oculta na leitura o lado de outra empresa em eventos antigos de transferência", async () => {
  const antes = JSON.stringify({
    id_empresa: 10,
    email: "origem@example.invalid",
  })
  const depois = JSON.stringify({
    id_empresa: 20,
    email: "destino@example.invalid",
  })
  db.auditoria.findMany.mockResolvedValue([
    {
      id: 1,
      id_empresa: 10,
      tabela: "fornecedores",
      dados_anteriores: antes,
      dados_novos: depois,
      usuarios: null,
    },
  ])
  const origem = await (await consultar()).json()
  expect(origem.itens[0].antes.email).toBe("origem@example.invalid")
  expect(origem.itens[0].depois).toBeNull()
  expect(JSON.stringify(origem)).not.toContain("destino@example.invalid")
  expect(lerSnapshot(antes, 20)).toBeNull()
  expect(lerSnapshot(depois, 20)).toMatchObject({
    email: "destino@example.invalid",
  })
})
it("valida datas e protege conteúdo legado não estruturado", () => {
  expect(filtrosAuditoria.parse({})).toEqual({ pagina: 1 })
  expect(periodoAuditoria(undefined, "2026-12-31").lt?.toISOString()).toBe(
    "2027-01-01T03:00:00.000Z",
  )
  expect(lerSnapshot("senha=segredo")).not.toContain("segredo")
  expect(lerSnapshot('{"ok":true}')).toEqual({ ok: true })
})
it.each(["LOGIN", "LOGOUT"])(
  "permite filtrar ação existente de sessão: %s",
  async (acao) => {
    expect((await consultar(`?acao=${acao}`)).status).toBe(200)
    expect(db.auditoria.count).toHaveBeenCalledWith({
      where: { id_empresa: 10, acao },
    })
  },
)

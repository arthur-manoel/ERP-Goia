import { beforeEach, expect, it, vi } from "vitest"
import { db } from "../../helpers/prisma"
import { request, context } from "../../helpers/http"
import * as setores from "../../../src/app/api/setores/route"
import * as setor from "../../../src/app/api/setores/[id]/route"
import * as fluxos from "../../../src/app/api/fluxos-producao/route"
import * as fluxo from "../../../src/app/api/fluxos-producao/[id]/route"
import { GET as relatorio } from "../../../src/app/api/relatorios/estoque/produtos/route"
import { autorizarEstoque } from "../../../src/modules/estoque-minimo/estoque-minimo.authorization"

const services = vi.hoisted(() => ({
  salvar: vi.fn(),
  consultar: vi.fn(),
  listar: vi.fn(),
  excluir: vi.fn(),
}))
vi.mock("../../../src/modules/fluxos/fluxos.service", () => services)
const membership = (
  permissoes: Array<{
    recurso: string
    pode_ler?: boolean
    pode_criar?: boolean
    pode_editar?: boolean
    pode_excluir?: boolean
  }> = [],
) => ({
  id_empresa: 10,
  nivel_acesso: "USUARIO",
  usuarios: { nivel_acesso: "USUARIO" },
  permissoes_usuario: permissoes,
})
beforeEach(() => {
  services.listar.mockResolvedValue({ dados: [] })
  services.consultar.mockResolvedValue({ id: 1 })
  services.salvar.mockResolvedValue({ id: 1 })
})

for (const [recurso, collection, item] of [
  ["SETORES", setores, setor],
  ["FLUXOS_PRODUCAO", fluxos, fluxo],
] as const) {
  for (const [acao, method, invoke, body] of [
    ["ler", "GET", (r: Request) => collection.GET(r), undefined],
    ["ler", "GET", (r: Request) => item.GET(r, context()), undefined],
    [
      "criar",
      "POST",
      (r: Request) => collection.POST(r),
      recurso === "SETORES"
        ? { nome: "Corte" }
        : { nome: "Fluxo", setores: [1] },
    ],
    [
      "editar",
      "PATCH",
      (r: Request) => item.PATCH(r, context()),
      { nome: "Novo" },
    ],
    ["excluir", "DELETE", (r: Request) => item.DELETE(r, context()), undefined],
  ] as const) {
    it(`${recurso} ${method}: exige a concessão correta antes de chamar o serviço`, async () => {
      db.usuario_empresa.findMany.mockResolvedValue([
        membership([
          {
            recurso: "ORDENS_PRODUCAO",
            pode_ler: true,
            pode_criar: true,
            pode_editar: true,
            pode_excluir: true,
          },
        ]),
      ])
      expect(
        (await invoke(await request("/api/test", method, body))).status,
      ).toBe(403)
      for (const service of Object.values(services))
        expect(service).not.toHaveBeenCalled()
      db.usuario_empresa.findMany.mockResolvedValue([
        membership([{ recurso, [`pode_${acao}`]: true }]),
      ])
      expect(
        (await invoke(await request("/api/test", method, body))).status,
      ).toBeLessThan(300)
    })
  }
}

it.each(
  [
    [],
    [{ recurso: "ESTOQUE", pode_ler: true }],
    [{ recurso: "RELATORIOS", pode_ler: true }],
    [
      { recurso: "ESTOQUE", pode_ler: true },
      { recurso: "RELATORIOS", pode_criar: true },
    ],
  ].map((permissoes) => ({ permissoes })),
)(
  "relatório nega sem as duas concessões de leitura: %j",
  async ({ permissoes }) => {
    db.usuario_empresa.findMany.mockResolvedValue([membership(permissoes)])
    expect(
      (await relatorio(await request("/api/relatorios/estoque/produtos")))
        .status,
    ).toBe(403)
    expect(db.$transaction).not.toHaveBeenCalled()
  },
)

it("relatório exige as duas concessões no mesmo vínculo da empresa selecionada", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    membership([{ recurso: "ESTOQUE", pode_ler: true }]),
    {
      ...membership([{ recurso: "RELATORIOS", pode_ler: true }]),
      id_empresa: 20,
    },
  ])
  const r = await request("/api/relatorios/estoque/produtos")
  r.headers.set("X-Empresa-Id", "10")
  expect((await relatorio(r)).status).toBe(403)
  db.usuario_empresa.findMany.mockResolvedValue([
    membership([
      { recurso: "ESTOQUE", pode_ler: true },
      { recurso: "RELATORIOS", pode_ler: true },
    ]),
  ])
  expect(await autorizarEstoque(r, "ler", ["RELATORIOS"])).toMatchObject({
    idEmpresa: 10,
    idUsuario: 1,
  })
})

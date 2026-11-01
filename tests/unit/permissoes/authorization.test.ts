import { expect, it } from "vitest"
import { db } from "../../helpers/prisma"
import { allowedCompanies } from "../../../modules/catalogos/repository"
import { autorizar } from "../../../src/modules/producao/producao.authorization"
import {
  autorizar as compras,
  recursosDaOpcao,
} from "../../../src/modules/compras/compras.authorization"
import { autorizar as clientes } from "../../../src/modules/clientes/clientes.authorization"
import { autorizarEstoque } from "../../../src/modules/estoque-minimo/estoque-minimo.authorization"
import { RECURSOS_PERMISSAO } from "../../../src/lib/permissoes"

const req = (empresa = "10", token = "test-token") =>
  new Request("http://localhost/api/teste", {
    headers: { Authorization: `Bearer ${token}`, "X-Empresa-Id": empresa },
  })
const vinculo = (
  permissoes: unknown[] = [],
  id = 10,
  nivel = "USUARIO",
  global = "USUARIO",
) => ({
  id_empresa: id,
  nivel_acesso: nivel,
  usuarios: { nivel_acesso: global },
  permissoes_usuario: permissoes,
})
it("preserva os 18 recursos e não aceita recurso/ação ausente nem fallback null", async () => {
  expect(RECURSOS_PERMISSAO).toHaveLength(18)
  expect(new Set(RECURSOS_PERMISSAO).size).toBe(18)
  for (const value of [null, undefined, "__proto__", "INEXISTENTE"])
    expect(await allowedCompanies(1, value as never, "pode_ler")).toEqual([])
  expect(await allowedCompanies(1, "PRODUTOS", "constructor" as never)).toEqual(
    [],
  )
  expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
})
it.each(RECURSOS_PERMISSAO)(
  "consulta explícita de %s preserva ativos, empresa e flag",
  async (recurso) => {
    await allowedCompanies(1, recurso, "pode_editar")
    expect(db.usuario_empresa.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ATIVO",
          empresas: { status: "ATIVA" },
          usuarios: { status: "ATIVO" },
          OR: expect.arrayContaining([
            { permissoes_usuario: { some: { recurso, pode_editar: true } } },
          ]),
        }),
      }),
    )
  },
)
it("produção nega recurso null e ação inválida inclusive ao administrador", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    vinculo([], 10, "EMPRESA", "ADMIN"),
  ])
  await expect(autorizar(req(), "ler", null as never)).rejects.toMatchObject({
    status: 403,
  })
  await expect(autorizar(req(), "constructor" as never)).rejects.toMatchObject({
    status: 403,
  })
  expect(db.usuario_empresa.findMany).not.toHaveBeenCalled()
})
it.each(["SETORES", "FLUXOS_PRODUCAO", "ORDENS_PRODUCAO", "PRODUTOS"] as const)(
  "%s não herda permissão de outro módulo/ação",
  async (recurso) => {
    for (const grant of [
      [],
      [{ recurso: "CLIENTES", pode_editar: true }],
      [{ recurso, pode_ler: true }],
      [{ recurso, pode_editar: false }],
    ]) {
      db.usuario_empresa.findMany.mockResolvedValue([vinculo(grant)])
      await expect(autorizar(req(), "editar", recurso)).rejects.toMatchObject({
        status: 403,
      })
    }
    db.usuario_empresa.findMany.mockResolvedValue([
      vinculo([{ recurso, pode_editar: true }]),
    ])
    expect(await autorizar(req(), "editar", recurso)).toEqual({
      idUsuario: 1,
      idEmpresa: 10,
    })
    await expect(autorizar(req("20"), "editar", recurso)).rejects.toMatchObject(
      { status: 403 },
    )
  },
)
it("COMPRAS não herda ESTOQUE; notas continuam NOTAS_FISCAIS", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    vinculo([{ recurso: "ESTOQUE", pode_ler: true }]),
  ])
  await expect(compras(req(), "compras", "ler")).rejects.toMatchObject({
    status: 403,
  })
  db.usuario_empresa.findMany.mockResolvedValue([
    vinculo([{ recurso: "COMPRAS", pode_ler: true }]),
  ])
  expect(await compras(req(), "compras", "ler")).toMatchObject({
    idEmpresa: 10,
  })
  await expect(compras(req(), "notas", "ler")).rejects.toMatchObject({
    status: 403,
  })
  db.usuario_empresa.findMany.mockResolvedValue([
    vinculo([{ recurso: "NOTAS_FISCAIS", pode_ler: true }]),
  ])
  expect(await compras(req(), "notas", "ler")).toMatchObject({ idEmpresa: 10 })
  expect(recursosDaOpcao("fornecedores")).toEqual(["COMPRAS", "NOTAS_FISCAIS"])
})
it.each([
  [false, false],
  [true, false],
  [false, true],
  [true, true],
])(
  "relatório exige ESTOQUE=%s e RELATORIOS=%s na mesma empresa",
  async (estoque, relatorios) => {
    db.usuario_empresa.findMany.mockResolvedValue([
      vinculo([
        { recurso: "ESTOQUE", pode_ler: estoque },
        { recurso: "RELATORIOS", pode_ler: relatorios },
      ]),
    ])
    if (estoque && relatorios)
      expect(await autorizarEstoque(req(), "ler", true)).toMatchObject({
        idEmpresa: 10,
      })
    else
      await expect(autorizarEstoque(req(), "ler", true)).rejects.toMatchObject({
        status: 403,
      })
  },
)
it("relatório não combina concessões de empresas distintas", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    vinculo([{ recurso: "ESTOQUE", pode_ler: true }]),
    vinculo([{ recurso: "RELATORIOS", pode_ler: true }], 20),
  ])
  for (const empresa of ["10", "20"])
    await expect(
      autorizarEstoque(req(empresa), "ler", true),
    ).rejects.toMatchObject({ status: 403 })
})
it("histórico de vendas exige CLIENTES e VENDAS, sem confundir PEDIDOS", async () => {
  db.usuario_empresa.findMany.mockResolvedValue([
    vinculo([
      { recurso: "CLIENTES", pode_ler: true },
      { recurso: "PEDIDOS", pode_ler: true },
    ]),
  ])
  await expect(clientes(req(), "ler", true)).rejects.toMatchObject({
    status: 403,
  })
  db.usuario_empresa.findMany.mockResolvedValue([
    vinculo([
      { recurso: "CLIENTES", pode_ler: true },
      { recurso: "VENDAS", pode_ler: true },
    ]),
  ])
  expect(await clientes(req(), "ler", true)).toMatchObject({ idEmpresa: 10 })
})
it("exceção administrativa exige vínculo e token válidos", async () => {
  for (const [nivel, global] of [
    ["EMPRESA", "USUARIO"],
    ["USUARIO", "ADMIN"],
  ]) {
    db.usuario_empresa.findMany.mockResolvedValue([
      vinculo([], 10, nivel, global),
    ])
    expect(await autorizar(req(), "editar")).toMatchObject({ idEmpresa: 10 })
    expect(await autorizarEstoque(req(), "ler", true)).toMatchObject({
      idEmpresa: 10,
    })
  }
  db.usuario_empresa.findMany.mockResolvedValue([])
  await expect(autorizar(req(), "editar")).rejects.toMatchObject({
    status: 403,
  })
  expect(await autorizar(req("10", "invalid-token"), "editar")).toMatchObject({
    status: 401,
  })
})

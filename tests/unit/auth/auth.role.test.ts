import { describe, expect, it } from "vitest"
import { perfisDosRecursos, resolveUserRole } from "@/modules/auth/auth.role"

type Vinculo = Parameters<typeof resolveUserRole>[0]["usuario_empresa"][number]
const vinculo = (parcial: Partial<Vinculo> = {}): Vinculo => ({
  status: "ATIVO",
  nivel_acesso: "USUARIO",
  empresas: { status: "ATIVA" },
  cargos: { nome: "Operador", status: "ATIVO" },
  setores: null,
  ...parcial,
})
const usuario = (v: Vinculo, nivel = "USUARIO") => ({
  nivel_acesso: nivel,
  usuario_empresa: [v],
})

describe("resolveUserRole (5.1: nome de setor não concede privilégio)", () => {
  it("renomear o setor de Produção para Administrativo não vira ADMINISTRACAO", () => {
    const setor = (nome: string) => ({
      status: "ATIVO",
      nome, // campo extra ignorado: o nome não é lido
      permissoes_setor: [{ recurso: "ORDENS_PRODUCAO" }],
    })
    const antes = resolveUserRole(
      usuario(vinculo({ setores: setor("Produção") as never })),
    )
    const depois = resolveUserRole(
      usuario(vinculo({ setores: setor("Administrativo") as never })),
    )
    expect(antes).toBe("PRODUCAO")
    expect(depois).toBe("PRODUCAO")
  })
  it("setor sem permissoes_setor não gera perfil, mesmo chamado Administração", () => {
    const setores = {
      status: "ATIVO",
      nome: "Administração",
      tipo: "Administração",
      permissoes_setor: [],
    }
    expect(
      resolveUserRole(usuario(vinculo({ setores: setores as never }))),
    ).toBeNull()
  })
  it("nome de cargo Administrativo não concede ADMINISTRACAO", () => {
    expect(
      resolveUserRole(
        usuario(
          vinculo({ cargos: { nome: "Administrativo", status: "ATIVO" } }),
        ),
      ),
    ).toBeNull()
  })
  it("ADMINISTRACAO vem só de flags estáveis", () => {
    expect(resolveUserRole(usuario(vinculo(), "ADMIN"))).toBe("ADMINISTRACAO")
    expect(resolveUserRole(usuario(vinculo({ nivel_acesso: "EMPRESA" })))).toBe(
      "ADMINISTRACAO",
    )
  })
  it("vínculo EMPRESA ativo mantém acesso com cargo e setor de Produção", () => {
    expect(
      resolveUserRole(
        usuario(
          vinculo({
            nivel_acesso: "EMPRESA",
            cargos: { nome: "Produção", status: "ATIVO" },
            setores: {
              status: "ATIVO",
              permissoes_setor: [{ recurso: "ORDENS_PRODUCAO" }],
            },
          }),
        ),
      ),
    ).toBe("ADMINISTRACAO")
  })
  it("setor inativo ou vínculo inativo não concedem perfil", () => {
    const setores = {
      status: "INATIVO",
      permissoes_setor: [{ recurso: "PEDIDOS" }],
    }
    expect(resolveUserRole(usuario(vinculo({ setores })))).toBeNull()
    expect(
      resolveUserRole(
        usuario(vinculo({ status: "INATIVO", nivel_acesso: "EMPRESA" })),
      ),
    ).toBeNull()
  })
  it("perfis conflitantes continuam ambíguos (sem perfil arbitrário)", () => {
    const setores = {
      status: "ATIVO",
      permissoes_setor: [{ recurso: "PEDIDOS" }],
    }
    expect(
      resolveUserRole(
        usuario(
          vinculo({ setores, cargos: { nome: "Produção", status: "ATIVO" } }),
        ),
      ),
    ).toBeNull()
  })
  it("cargo funcional continua funcionando", () => {
    expect(
      resolveUserRole(
        usuario(vinculo({ cargos: { nome: "Produção", status: "ATIVO" } })),
      ),
    ).toBe("PRODUCAO")
  })
})

describe("perfisDosRecursos", () => {
  it("nenhum recurso concede ADMINISTRACAO e desconhecidos são ignorados", () => {
    const todos = [
      "PRODUTOS",
      "SETORES",
      "FINANCEIRO",
      "ORDENS_PRODUCAO",
      "x",
      "constructor",
    ]
    expect([...perfisDosRecursos(todos)].sort()).toEqual([
      "FINANCEIRO",
      "PRODUCAO",
    ])
  })
})

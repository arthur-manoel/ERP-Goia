// @vitest-environment jsdom
import { act, createElement, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import {
  ProvedorAutenticacao,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { ProtecaoRota } from "@/features/autenticacao/components/protecao-rota"
const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/cadastros/clientes",
}))
vi.mock("@/features/erp/components/seletor-pesquisavel", () => ({
  SearchSelect: ({
    label,
    options,
    value,
    onValueChange,
  }: {
    label: string
    options: Array<{ value: string; label: string }>
    value: string
    onValueChange: (v: string) => void
  }) =>
    createElement(
      "select",
      {
        "aria-label": label,
        value,
        onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
          onValueChange(e.target.value),
      },
      createElement("option", { value: "" }, "Selecione uma empresa"),
      ...options.map((o) =>
        createElement("option", { key: o.value, value: o.value }, o.label),
      ),
    ),
}))
let ctx: ReturnType<typeof useAutenticacao>, root: Root, host: HTMLDivElement
let refresh: string | null,
  resposta: (token: string) => Promise<Response>,
  chamadas: ReturnType<typeof vi.fn>,
  montagens: number
const corpo = (id = 1, empresas = [{ id: 10, nome: "Empresa A" }]) => ({
  success: true,
  data: {
    usuario: { id, nome: `Pessoa ${id}`, email: `p${id}@example.test` },
    empresas,
  },
})
const json = (id = 1, empresas = [{ id: 10, nome: "Empresa A" }]) =>
  Response.json(corpo(id, empresas))
function Capturar() {
  const valor = useAutenticacao()
  useEffect(() => {
    ctx = valor
  }, [valor])
  return null
}
function Modulo() {
  useEffect(() => {
    montagens++
  }, [])
  return createElement("div", null, "Módulo carregado")
}
async function montar() {
  await act(async () => {
    root.render(
      createElement(
        ProvedorAutenticacao,
        null,
        createElement(Capturar),
        createElement(ProtecaoRota, null, createElement(Modulo)),
      ),
    )
  })
}
async function desmontar() {
  await act(async () => root.unmount())
}
function pendente<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}
beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  sessionStorage.clear()
  refresh = "token-1"
  resposta = async () => json()
  montagens = 0
  vi.stubGlobal("BroadcastChannel", undefined)
  chamadas = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/refresh")
      return refresh
        ? Response.json({ accessToken: refresh })
        : Response.json({ error: "Não autenticado." }, { status: 401 })
    if (url === "/api/auth/login") {
      const data = JSON.parse(String(init?.body))
      return Response.json({
        accessToken: data.email === "b@example.test" ? "token-2" : "token-1",
      })
    }
    if (url === "/api/auth/logout") return Response.json({ ok: true })
    if (url === "/api/auth/empresas")
      return resposta(new Headers(init?.headers).get("Authorization") ?? "")
    return Response.json({ ok: true })
  })
  vi.stubGlobal("fetch", chamadas)
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await desmontar()
  host.remove()
  vi.unstubAllGlobals()
})
it.each(["vendas", "financeiro"])(
  "login de %s descobre e seleciona única empresa sem header de módulo",
  async () => {
    refresh = null
    await montar()
    await act(async () => ctx.entrar("a@example.test", "fixture"))
    expect(ctx.estado).toBe("autenticado")
    expect(ctx.empresa?.id).toBe(10)
    expect(montagens).toBe(1)
    const [, init] = chamadas.mock.calls.find(
      ([url]) => url === "/api/auth/empresas",
    )!
    expect(new Headers(init?.headers).has("X-Empresa-Id")).toBe(false)
    expect(
      chamadas.mock.calls.some(
        ([u]) =>
          u === "/api/estoque-minimo/empresas" || u === "/api/auth/contexto",
      ),
    ).toBe(false)
    expect(sessionStorage.getItem("erp-goia-empresa-ativa:1")).toBe("10")
  },
)
it("aguarda empresas sem montar módulo, depois mostra seletor para várias", async () => {
  const p = pendente<Response>()
  resposta = () => p.promise
  await montar()
  expect(ctx.estado).toBe("carregando")
  expect(montagens).toBe(0)
  await act(async () =>
    p.resolve(
      json(1, [
        { id: 10, nome: "A" },
        { id: 20, nome: "B" },
      ]),
    ),
  )
  expect(ctx.empresa).toBeNull()
  expect(host.textContent).toContain("Selecione uma empresa")
  expect(montagens).toBe(0)
  await expect(ctx.requisitar("/api/teste")).rejects.toThrow(
    "Selecione uma empresa",
  )
  await act(async () => ctx.selecionarEmpresa(20))
  expect(montagens).toBe(1)
  expect(ctx.empresa?.id).toBe(20)
})
it("recarregamento restaura preferência válida associada ao usuário", async () => {
  sessionStorage.setItem("erp-goia-empresa-ativa:1", "20")
  resposta = async () =>
    json(1, [
      { id: 10, nome: "A" },
      { id: 20, nome: "B" },
    ])
  await montar()
  expect(ctx.empresa?.id).toBe(20)
})
it("seleção inválida é removida; preferência antiga sem usuário não é reaproveitada", async () => {
  sessionStorage.setItem("erp-goia-empresa-ativa:1", "999")
  sessionStorage.setItem("erp-goia-empresa-ativa", "20")
  resposta = async () =>
    json(1, [
      { id: 10, nome: "A" },
      { id: 20, nome: "B" },
    ])
  await montar()
  expect(ctx.empresa).toBeNull()
  expect(sessionStorage.getItem("erp-goia-empresa-ativa:1")).toBeNull()
  expect(sessionStorage.getItem("erp-goia-empresa-ativa")).toBeNull()
})
it("lista vazia é sucesso com mensagem própria, sem montar módulos nem deslogar", async () => {
  resposta = async () => json(1, [])
  await montar()
  expect(ctx.estado).toBe("autenticado")
  expect(ctx.empresas).toEqual([])
  expect(host.textContent).toContain("Nenhuma empresa disponível")
  expect(montagens).toBe(0)
})
it.each(["rede", "500"])(
  "falha %s é diferente de lista vazia e permite nova tentativa",
  async (tipo) => {
    resposta = async () => {
      if (tipo === "rede") throw new Error("offline")
      return Response.json({ error: "falha" }, { status: 500 })
    }
    await montar()
    expect(ctx.estado).toBe("erro")
    expect(host.textContent).toContain("Não foi possível carregar")
    expect(montagens).toBe(0)
    resposta = async () => json()
    await act(async () => ctx.recarregarAcesso())
    expect(ctx.estado).toBe("autenticado")
    expect(ctx.empresa?.id).toBe(10)
  },
)
it("refresh sem rede oferece recuperação sem confundir com credenciais inválidas", async () => {
  chamadas.mockImplementationOnce(async () => {
    throw new Error("rede")
  })
  await montar()
  expect(ctx.estado).toBe("erro")
  await act(async () => ctx.recarregarAcesso())
  expect(ctx.estado).toBe("autenticado")
})
it("sessão expirada na restauração retorna ao login e não consulta empresas", async () => {
  refresh = null
  await montar()
  expect(ctx.estado).toBe("anonimo")
  expect(router.replace).toHaveBeenCalledWith(
    "/login?retorno=%2Fcadastros%2Fclientes",
  )
  expect(chamadas.mock.calls.map(([u]) => u)).not.toContain(
    "/api/auth/empresas",
  )
})
it("logout limpa contexto e preferência; login seguinte não herda empresa do anterior", async () => {
  resposta = async (token) =>
    token === "Bearer token-2"
      ? json(2, [
          { id: 10, nome: "A" },
          { id: 20, nome: "B" },
        ])
      : json()
  await montar()
  await act(async () => ctx.sair())
  expect(ctx.usuario).toBeNull()
  expect(sessionStorage.getItem("erp-goia-empresa-ativa:1")).toBeNull()
  await act(async () => ctx.entrar("b@example.test", "fixture"))
  expect(ctx.usuario?.id).toBe(2)
  expect(ctx.empresa).toBeNull()
  expect(ctx.empresas).toHaveLength(2)
})
it("resposta de empresas atrasada não preenche contexto após logout", async () => {
  const p = pendente<Response>()
  resposta = () => p.promise
  await montar()
  await act(async () => ctx.sair())
  await act(async () => p.resolve(json()))
  expect(ctx.estado).toBe("anonimo")
  expect(ctx.usuario).toBeNull()
  expect(ctx.empresas).toEqual([])
})
it("resposta do usuário anterior não substitui o usuário que entrou depois", async () => {
  refresh = null
  await montar()
  const p = pendente<Response>()
  resposta = async (token) =>
    token === "Bearer token-1" ? p.promise : json(2, [{ id: 20, nome: "B" }])
  let antigo!: Promise<unknown>
  await act(async () => {
    antigo = ctx.entrar("a@example.test", "fixture").catch((e) => e)
  })
  await act(async () => ctx.entrar("b@example.test", "fixture"))
  await act(async () => {
    p.resolve(json())
    await antigo
  })
  expect(ctx.usuario?.id).toBe(2)
  expect(ctx.empresa?.id).toBe(20)
})
it("renovação em operação relê vínculos e não usa empresa removida", async () => {
  await montar()
  chamadas.mockImplementationOnce(async () =>
    Response.json({ error: "expirou" }, { status: 401 }),
  )
  resposta = async () => json(1, [])
  await act(async () => {
    await expect(ctx.requisitar("/api/teste")).rejects.toMatchObject({
      name: "AbortError",
    })
  })
  expect(ctx.estado).toBe("autenticado")
  expect(ctx.empresa).toBeNull()
  expect(host.textContent).toContain("Nenhuma empresa disponível")
})
it("operação continua após refresh e expiração definitiva encerra a sessão", async () => {
  await montar()
  chamadas.mockImplementationOnce(async () =>
    Response.json({}, { status: 401 }),
  )
  await act(async () => {
    expect((await ctx.requisitar("/api/teste")).status).toBe(200)
  })
  refresh = null
  chamadas.mockImplementationOnce(async () =>
    Response.json({}, { status: 401 }),
  )
  await act(async () => {
    expect((await ctx.requisitar("/api/teste")).status).toBe(401)
  })
  expect(ctx.estado).toBe("anonimo")
})
it("resposta de módulo após trocar empresa é descartada", async () => {
  resposta = async () =>
    json(1, [
      { id: 10, nome: "A" },
      { id: 20, nome: "B" },
    ])
  await montar()
  await act(async () => ctx.selecionarEmpresa(10))
  const p = pendente<Response>()
  chamadas.mockImplementationOnce(() => p.promise)
  const request = ctx.requisitar("/api/teste").catch((e) => e)
  await act(async () => ctx.selecionarEmpresa(20))
  await act(async () => p.resolve(Response.json({})))
  expect(await request).toMatchObject({ name: "AbortError" })
})
it("helper substitui headers sem duplicar empresa nem aceitar autorização manipulada", async () => {
  await montar()
  await act(async () => {
    await ctx.requisitar("/api/teste", {
      headers: new Headers({
        "x-empresa-id": "10",
        authorization: "Bearer forjado",
      }),
    })
  })
  const [, init] = chamadas.mock.calls.at(-1)!
  expect(new Headers(init?.headers).get("X-Empresa-Id")).toBe("10")
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token-1")
  const count = chamadas.mock.calls.length
  await expect(
    ctx.requisitar("/api/teste", { headers: { "X-Empresa-Id": "20" } }),
  ).rejects.toThrow("empresa selecionada mudou")
  expect(chamadas).toHaveBeenCalledTimes(count)
})
it("refresh 500 é falha recuperável e não expiração de credenciais", async () => {
  chamadas.mockImplementationOnce(async () =>
    Response.json({ error: "indisponível" }, { status: 500 }),
  )
  await montar()
  expect(ctx.estado).toBe("erro")
  expect(router.replace).not.toHaveBeenCalled()
  await act(async () => ctx.recarregarAcesso())
  expect(ctx.estado).toBe("autenticado")
})
it("refresh de outra pessoa não repete operação antiga, mesmo na mesma empresa", async () => {
  await montar()
  chamadas.mockImplementationOnce(async () =>
    Response.json({}, { status: 401 }),
  )
  resposta = async () => json(2, [{ id: 10, nome: "Empresa A" }])
  await act(async () => {
    await expect(ctx.requisitar("/api/teste")).rejects.toMatchObject({
      name: "AbortError",
    })
  })
  expect(ctx.usuario?.id).toBe(2)
  expect(
    chamadas.mock.calls.filter(([url]) => url === "/api/teste"),
  ).toHaveLength(1)
})

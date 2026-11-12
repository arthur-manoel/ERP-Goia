// @vitest-environment jsdom
import { act, createElement, useEffect } from "react"
import { createRoot, type Root } from "react-dom/client"
import { beforeEach, afterEach, expect, it, vi, type Mock } from "vitest"
import {
  ProvedorAutenticacao,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { ProtecaoRota } from "@/features/autenticacao/components/protecao-rota"
import { comBloqueioSessao } from "@/features/autenticacao/requisicoes-sessao"
import { ProdutosProntosView } from "@/features/produtos/components/produtos-prontos-view"
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
  chamadas: Mock<(url: string, init?: RequestInit) => Promise<Response>>,
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
  return createElement(
    "div",
    null,
    "Módulo carregado",
    createElement("input", { "aria-label": "Dados da operação" }),
  )
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
const duasEmpresas = [
  { id: 10, nome: "A" },
  { id: 20, nome: "B" },
]

it.each([
  "disponível",
  "getter",
  "leitura",
  "gravação",
  "bloqueio após escolher",
])(
  "renova com a empresa B e mantém o formulário com armazenamento %s",
  async (cenario) => {
    const negar = () => {
      throw new DOMException("Armazenamento bloqueado", "SecurityError")
    }
    resposta = async () => json(1, duasEmpresas)
    if (cenario === "getter")
      vi.spyOn(window, "sessionStorage", "get").mockImplementation(negar)
    if (cenario === "leitura")
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(negar)
    if (cenario === "gravação")
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(negar)
    try {
      await montar()
      await act(async () => ctx.selecionarEmpresa(20))
      const empresa = ctx.empresa
      if (cenario === "bloqueio após escolher")
        vi.spyOn(window, "sessionStorage", "get").mockImplementation(negar)
      const campo = host.querySelector("input")!
      campo.value = "rascunho da empresa B"
      const body = JSON.stringify({ nome: campo.value })
      refresh = "token-renovado"
      chamadas.mockImplementationOnce(
        async () => new Response(null, { status: 401 }),
      )
      await act(async () => {
        expect(
          (await ctx.requisitar("/api/escrita", { method: "POST", body }))
            .status,
        ).toBe(200)
      })
      expect(ctx.empresa?.id).toBe(20)
      expect(ctx.empresa).toBe(empresa)
      expect(host.querySelector("input")).toBe(campo)
      expect(campo.value).toBe("rascunho da empresa B")
      const envios = chamadas.mock.calls.filter(
        ([url]) => url === "/api/escrita",
      )
      expect(
        envios.map(([, init]) => [
          new Headers(init?.headers).get("X-Empresa-Id"),
          new Headers(init?.headers).get("Authorization"),
          init?.body,
        ]),
      ).toEqual([
        ["20", "Bearer token-1", body],
        ["20", "Bearer token-renovado", body],
      ])
    } finally {
      vi.restoreAllMocks()
    }
  },
)
it("falha temporária durante a descoberta mantém a empresa e o formulário montado", async () => {
  resposta = async () => json(1, duasEmpresas)
  await montar()
  await act(async () => ctx.selecionarEmpresa(20))
  const campo = host.querySelector("input")!
  campo.value = "dados pendentes"
  const consultaIniciada = pendente<void>()
  const consulta = pendente<Response>()
  resposta = () => {
    consultaIniciada.resolve()
    return consulta.promise
  }
  refresh = "token-novo"
  chamadas.mockImplementationOnce(
    async () => new Response(null, { status: 401 }),
  )
  await act(async () => {
    const operacao = ctx
      .requisitar("/api/escrita", { method: "POST" })
      .catch((e) => e)
    await consultaIniciada.promise
    const paralela = ctx.requisitar("/api/paralela").catch((e) => e)
    expect(host.querySelector("input")).toBe(campo)
    expect(ctx.empresa?.id).toBe(20)
    consulta.resolve(new Response(null, { status: 503 }))
    expect(await operacao).toMatchObject({
      message: expect.stringContaining("renovar"),
    })
    expect(await paralela).toMatchObject({
      message: expect.stringContaining("renovar"),
    })
  })
  expect(ctx.estado).toBe("autenticado")
  expect(ctx.erroAcesso).toContain("Não foi possível carregar")
  expect(ctx.empresa?.id).toBe(20)
  expect(ctx.empresas).toEqual(duasEmpresas)
  expect(host.querySelector("input")).toBe(campo)
  expect(campo.value).toBe("dados pendentes")
  expect(
    chamadas.mock.calls.filter(([u]) => u === "/api/escrita"),
  ).toHaveLength(1)
  expect(
    chamadas.mock.calls.filter(([u]) => u === "/api/paralela"),
  ).toHaveLength(0)
  resposta = async () => json(1, duasEmpresas)
  await act(async () => ctx.recarregarAcesso())
  expect(ctx.erroAcesso).toBeNull()
  expect(ctx.empresa?.id).toBe(20)
  expect(host.querySelector("input")).toBe(campo)
})

it("troca durante refresh prevalece e a escrita antiga não migra para outra empresa", async () => {
  resposta = async () => json(1, duasEmpresas)
  await montar()
  await act(async () => ctx.selecionarEmpresa(10))
  const iniciar = pendente<void>()
  const consulta = pendente<Response>()
  refresh = "token-novo"
  resposta = () => {
    iniciar.resolve()
    return consulta.promise
  }
  const bloqueio = vi
    .spyOn(Storage.prototype, "getItem")
    .mockImplementation(() => {
      throw new DOMException("Armazenamento bloqueado", "SecurityError")
    })
  try {
    chamadas.mockImplementationOnce(
      async () => new Response(null, { status: 401 }),
    )
    let operacao!: Promise<unknown>
    await act(async () => {
      operacao = ctx
        .requisitar("/api/escrita-antiga", { method: "POST" })
        .catch((e) => e)
      await iniciar.promise
      ctx.selecionarEmpresa(20)
    })
    await act(async () => {
      consulta.resolve(json(1, duasEmpresas))
      expect(await operacao).toMatchObject({ name: "AbortError" })
    })
    expect(ctx.empresa?.id).toBe(20)
    expect(
      chamadas.mock.calls.filter(([u]) => u === "/api/escrita-antiga"),
    ).toHaveLength(1)
    await act(async () => ctx.requisitar("/api/nova"))
    expect(
      new Headers(chamadas.mock.calls.at(-1)?.[1]?.headers).get("X-Empresa-Id"),
    ).toBe("20")
  } finally {
    bloqueio.mockRestore()
  }
})

it("descarta descoberta da renovação anterior depois de sair e entrar em outra conta", async () => {
  resposta = async () => json(1, duasEmpresas)
  await montar()
  await act(async () => ctx.selecionarEmpresa(20))
  const iniciar = pendente<void>()
  const consulta = pendente<Response>()
  refresh = "token-antigo-renovado"
  resposta = (token) => {
    if (token === "Bearer token-2")
      return Promise.resolve(json(2, [{ id: 30, nome: "C" }]))
    iniciar.resolve()
    return consulta.promise
  }
  chamadas.mockImplementationOnce(
    async () => new Response(null, { status: 401 }),
  )
  let operacao!: Promise<unknown>
  await act(async () => {
    operacao = ctx
      .requisitar("/api/escrita-antiga", { method: "POST" })
      .catch((e) => e)
    await iniciar.promise
  })
  await act(async () => ctx.sair())
  await act(async () => ctx.entrar("b@example.test", "fixture"))
  await act(async () => {
    consulta.resolve(json(1, duasEmpresas))
    expect(await operacao).toMatchObject({ name: "AbortError" })
  })
  expect(ctx.usuario?.id).toBe(2)
  expect(ctx.empresa?.id).toBe(30)
  expect(
    chamadas.mock.calls.filter(([u]) => u === "/api/escrita-antiga"),
  ).toHaveLength(1)
})

it("consulta temporariamente indisponível sem empresa selecionada mantém a tela de erro", async () => {
  resposta = async () => json(1, duasEmpresas)
  await montar()
  expect(ctx.empresa).toBeNull()
  resposta = async () => new Response(null, { status: 503 })
  await act(async () => ctx.recarregarAcesso())
  expect(ctx.estado).toBe("erro")
  expect(ctx.empresas).toEqual(duasEmpresas)
  expect(host.querySelector("select")).toBeNull()
  expect(montagens).toBe(0)
})

it.each([401, 403])(
  "formulário de produto distingue falha de renovação de acesso negado (%s)",
  async (status) => {
    let descobertaIndisponivel = false
    resposta = async () =>
      descobertaIndisponivel
        ? new Response(null, { status: 503 })
        : json(1, duasEmpresas)
    const consultaProdutos = pendente<Response>()
    const consultaIniciada = pendente<void>()
    const autenticacao = chamadas.getMockImplementation()!
    chamadas.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/produtos?")) {
        if (url.includes("busca=teste")) {
          consultaIniciada.resolve()
          return consultaProdutos.promise
        }
        return Response.json({ data: { rows: [], count: 0, totalPages: 1 } })
      }
      const rota = url.split("?")[0]
      if (rota === "/api/tipos_produto" || rota === "/api/produtos/tipos")
        return Response.json({
          data: {
            rows: [{ id: 11, nome: "Teste", status: "ATIVO" }],
            totalPages: 1,
          },
        })
      return autenticacao(url, init)
    })
    await act(async () => {
      root.render(
        createElement(
          ProvedorAutenticacao,
          null,
          createElement(Capturar),
          createElement(ProtecaoRota, null, createElement(ProdutosProntosView)),
        ),
      )
    })
    await act(async () => ctx.selecionarEmpresa(20))
    const novo = [...host.querySelectorAll("button")].find((botao) =>
      botao.textContent?.includes("Novo produto"),
    )!
    const busca = host.querySelector<HTMLInputElement>(
      '[aria-label="Buscar produto"]',
    )!
    const alterar = (campo: HTMLInputElement, valor: string) => {
      const definir = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )!.set!
      definir.call(campo, valor)
      campo.dispatchEvent(new Event("input", { bubbles: true }))
    }
    expect(novo.disabled).toBe(false)
    await act(async () => alterar(busca, "teste"))
    await act(async () => novo.click())
    const seletor = '[data-slot="dialog-content"] input'
    const campo = document.querySelector<HTMLInputElement>(seletor)!
    await act(async () => alterar(campo, "rascunho da empresa B"))
    expect(campo.value).toBe("rascunho da empresa B")
    await act(async () => {
      await new Promise((resolver) => setTimeout(resolver, 350))
    })
    await consultaIniciada.promise
    refresh = "token-renovado"
    descobertaIndisponivel = true
    await act(async () =>
      consultaProdutos.resolve(
        Response.json({ error: "Acesso negado." }, { status }),
      ),
    )
    expect(ctx.empresa?.id).toBe(20)
    expect(novo.disabled).toBe(true)
    if (status === 401) {
      expect(host.textContent).toContain("Não foi possível renovar a sessão")
      expect(document.querySelector(seletor)).toBe(campo)
      expect(campo.value).toBe("rascunho da empresa B")
    } else {
      expect(host.textContent).toContain("Acesso negado.")
      expect(document.querySelector(seletor)).toBeNull()
    }
  },
)

it("perda do vínculo ativo pede nova escolha mesmo quando só sobra uma empresa", async () => {
  resposta = async () => json(1, duasEmpresas)
  await montar()
  await act(async () => ctx.selecionarEmpresa(10))
  const campo = host.querySelector("input")!
  campo.value = "dados exclusivos da empresa A"
  resposta = async () => json(1, [duasEmpresas[1]])
  chamadas.mockImplementationOnce(
    async () => new Response(null, { status: 401 }),
  )
  await act(async () => {
    await expect(
      ctx.requisitar("/api/escrita", { method: "POST" }),
    ).rejects.toMatchObject({
      name: "AbortError",
    })
  })
  expect(ctx.empresa).toBeNull()
  expect(host.querySelector("input")).toBeNull()
  expect(host.querySelector("select")?.options[1].value).toBe("20")
  expect(
    chamadas.mock.calls.filter(([u]) => u === "/api/escrita"),
  ).toHaveLength(1)
  await act(async () => ctx.recarregarAcesso())
  expect(ctx.empresa).toBeNull()
  await act(async () => ctx.selecionarEmpresa(20))
  expect(ctx.empresa?.id).toBe(20)
  expect(host.querySelector("input")?.value).toBe("")
})

it("login em outra aba invalida refresh pendente e o login local não ecoa", async () => {
  const canais = new Set<CanalTeste>()
  class CanalTeste extends EventTarget {
    constructor() {
      super()
      canais.add(this)
    }
    postMessage(data: unknown) {
      for (const canal of canais)
        if (canal !== this)
          canal.dispatchEvent(new MessageEvent("message", { data }))
    }
    close() {
      canais.delete(this)
    }
  }
  vi.stubGlobal("BroadcastChannel", CanalTeste)
  const outraAba = new CanalTeste()
  const avisos = vi.fn()
  outraAba.addEventListener("message", avisos)
  refresh = null
  await montar()
  resposta = async () => json(1, duasEmpresas)
  const loginIniciado = pendente<void>()
  const loginHttp = pendente<Response>()
  chamadas.mockImplementationOnce(() => {
    loginIniciado.resolve()
    return loginHttp.promise
  })
  const antiga = {
    tipo: "login",
    instante: performance.timeOrigin + performance.now() - 100,
  }
  let autenticar!: Promise<void>
  await act(async () => {
    autenticar = ctx.entrar("a@example.test", "fixture")
    await loginIniciado.promise
    outraAba.postMessage(antiga)
  })
  expect(ctx.estado).toBe("carregando")
  await act(async () => {
    loginHttp.resolve(Response.json({ accessToken: "token-1" }))
    await autenticar
    outraAba.postMessage(antiga)
  })
  expect(avisos).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      data: expect.objectContaining({ tipo: "login" }),
    }),
  )
  expect(ctx.usuario?.id).toBe(1)
  await act(async () => ctx.selecionarEmpresa(20))

  const iniciar = pendente<void>()
  const consulta = pendente<Response>()
  const instanteDoLoginRemoto = performance.timeOrigin + performance.now()
  refresh = "token-novo"
  resposta = () => {
    iniciar.resolve()
    return consulta.promise
  }
  chamadas.mockImplementationOnce(
    async () => new Response(null, { status: 401 }),
  )
  let operacao!: Promise<unknown>
  await act(async () => {
    operacao = ctx
      .requisitar("/api/escrita-antiga", { method: "POST" })
      .catch((e) => e)
    await iniciar.promise
  })
  await act(async () => {
    outraAba.postMessage({
      tipo: "login",
      instante: instanteDoLoginRemoto,
    })
    consulta.resolve(json(1, duasEmpresas))
    expect(await operacao).toMatchObject({ name: "AbortError" })
  })
  expect(ctx.estado).toBe("anonimo")
  expect(ctx.empresa).toBeNull()
  expect(
    chamadas.mock.calls.filter(([u]) => u === "/api/escrita-antiga"),
  ).toHaveLength(1)
  outraAba.close()
})

it.each([true, false])(
  "logout enfileirado considera se o aviso veio de um login posterior (%s)",
  async (posterior) => {
    const canais = new Set<EventTarget>()
    class CanalTeste extends EventTarget {
      constructor() {
        super()
        canais.add(this)
      }
      postMessage() {}
      close() {}
    }
    vi.stubGlobal("BroadcastChannel", CanalTeste)
    const avisoAnterior = performance.timeOrigin + performance.now() - 1
    await montar()
    const [canal] = canais
    const iniciou = pendente<void>()
    const liberar = pendente<void>()
    const bloqueio = comBloqueioSessao(() => {
      iniciou.resolve()
      return liberar.promise
    })
    await iniciou.promise
    let logout!: Promise<void>
    await act(async () => {
      logout = ctx.sair()
      canal.dispatchEvent(
        new MessageEvent("message", {
          data: {
            tipo: "login",
            instante: posterior
              ? performance.timeOrigin + performance.now() + 1
              : avisoAnterior,
          },
        }),
      )
      liberar.resolve()
      await Promise.all([bloqueio, logout])
    })
    expect(ctx.estado).toBe("anonimo")
    expect(
      chamadas.mock.calls.filter(([url]) => url === "/api/auth/logout"),
    ).toHaveLength(posterior ? 0 : 1)
  },
)

it("logout sem confirmação encerra a sessão local e informa a falha sem invalidar outras abas", async () => {
  const publicar = vi.fn()
  class CanalTeste extends EventTarget {
    postMessage = publicar
    close() {}
  }
  vi.stubGlobal("BroadcastChannel", CanalTeste)
  await montar()
  chamadas.mockImplementationOnce(async () =>
    Response.json(
      { error: "Logout temporariamente indisponível." },
      { status: 503 },
    ),
  )
  await act(async () => {
    await expect(ctx.sair()).rejects.toThrow(
      "Logout temporariamente indisponível.",
    )
  })
  expect(ctx.estado).toBe("anonimo")
  expect(publicar).not.toHaveBeenCalled()
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
  expect(ctx.usuario).toBeNull()
  expect(ctx.estado).toBe("anonimo")
  expect(
    chamadas.mock.calls.filter(([url]) => url === "/api/teste"),
  ).toHaveLength(1)
})

it("não envia operação de A com o token de B enquanto os vínculos de B estão sendo consultados", async () => {
  await montar()
  const consultaB = pendente<void>()
  const empresasB = pendente<Response>()
  refresh = "token-2"
  resposta = async () => {
    consultaB.resolve()
    return empresasB.promise
  }
  chamadas.mockImplementationOnce(async () =>
    Response.json({}, { status: 401 }),
  )
  let tokenAntesDaDescoberta: string | null = null
  await act(async () => {
    const original = ctx.requisitar("/api/original").catch(() => null)
    await consultaB.promise
    expect(ctx.usuario?.id).toBe(1)
    const segunda = ctx
      .requisitar("/api/segunda-operacao", { method: "POST" })
      .catch(() => null)
    await Promise.resolve()
    const post = chamadas.mock.calls.find(
      ([url]) => url === "/api/segunda-operacao",
    )
    tokenAntesDaDescoberta = new Headers(post?.[1]?.headers).get(
      "Authorization",
    )
    empresasB.resolve(json(2))
    await Promise.all([original, segunda])
  })
  expect(tokenAntesDaDescoberta).not.toBe("Bearer token-2")
})

it("descarta operação de A depois de trocar para B e retornar para A", async () => {
  resposta = async () =>
    json(1, [
      { id: 10, nome: "A" },
      { id: 20, nome: "B" },
    ])
  await montar()
  await act(async () => ctx.selecionarEmpresa(10))
  const original = pendente<Response>()
  chamadas.mockImplementationOnce(() => original.promise)
  const operacao = ctx
    .requisitar("/api/escrita-antiga", { method: "POST" })
    .catch((erro) => erro)
  await act(async () => ctx.selecionarEmpresa(20))
  await act(async () => ctx.selecionarEmpresa(10))
  let resultado: unknown
  await act(async () => {
    original.resolve(Response.json({}, { status: 401 }))
    resultado = await operacao
  })
  expect(
    chamadas.mock.calls.filter(([url]) => url === "/api/escrita-antiga"),
  ).toHaveLength(1)
  expect(resultado).toMatchObject({ name: "AbortError" })
})

it("tentar novamente renova antes de descobrir empresas com token expirado", async () => {
  await montar()
  refresh = "token-renovado"
  resposta = async (token) =>
    token === "Bearer token-renovado"
      ? json()
      : Response.json({}, { status: 401 })
  await act(async () => ctx.recarregarAcesso())
  expect(ctx.estado).toBe("autenticado")
  expect(ctx.usuario?.id).toBe(1)
  expect(
    new Headers(chamadas.mock.calls.at(-1)?.[1]?.headers).get("Authorization"),
  ).toBe("Bearer token-renovado")
})

it.each(["objeto", "tuplas", "Headers"] as const)(
  "retry com %s mantém a tentativa original e devolve o conflito de versão",
  async (formato) => {
    resposta = async () => json(1, duasEmpresas)
    await montar()
    await act(async () => ctx.selecionarEmpresa(20))
    const entradas: [string, string][] = [
      ["x-empresa-id", "20"],
      ["idempotency-key", "pedido-operacao-123"],
      ["if-match", '"3"'],
      ["content-type", "application/json"],
      ["x-operacao", "pedido"],
    ]
    const headers =
      formato === "Headers"
        ? new Headers(entradas)
        : formato === "tuplas"
          ? entradas
          : Object.fromEntries(entradas)
    const body = JSON.stringify({ observacao: "Empresa B" })
    const autenticacao = chamadas.getMockImplementation()!
    const tentativas: RequestInit[] = []
    chamadas.mockImplementation(async (url, init) => {
      if (url !== "/api/pedidos/1") return autenticacao(url, init)
      tentativas.push(init!)
      if (tentativas.length === 1) {
        if (headers instanceof Headers) headers.set("If-Match", '"999"')
        else if (Array.isArray(headers)) headers[2][1] = '"999"'
        else headers["if-match"] = '"999"'
        refresh = "token-renovado"
        return new Response(null, { status: 401 })
      }
      return Response.json({ error: "Versão desatualizada." }, { status: 409 })
    })
    await act(async () => {
      const response = await ctx.requisitar("/api/pedidos/1", {
        method: "PATCH",
        body,
        headers,
        credentials: "same-origin",
      })
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ error: "Versão desatualizada." })
    })
    expect(tentativas).toHaveLength(2)
    expect(ctx.empresa?.id).toBe(20)
    tentativas.forEach((tentativa, i) => {
      const recebidos = new Headers(tentativa.headers)
      expect(recebidos.get("Authorization")).toBe(
        i === 0 ? "Bearer token-1" : "Bearer token-renovado",
      )
      expect(recebidos.get("X-Empresa-Id")).toBe("20")
      expect(recebidos.get("Idempotency-Key")).toBe("pedido-operacao-123")
      expect(recebidos.get("If-Match")).toBe('"3"')
      expect(recebidos.get("Content-Type")).toBe("application/json")
      expect(recebidos.get("X-Operacao")).toBe("pedido")
      expect(tentativa).toMatchObject({
        method: "PATCH",
        body,
        credentials: "same-origin",
      })
    })
    const renovacao = chamadas.mock.calls
      .filter(([url]) => url === "/api/auth/refresh")
      .at(-1)
    expect(new Headers(renovacao?.[1]?.headers).get("Authorization")).toBe(
      "Bearer token-1",
    )
  },
)

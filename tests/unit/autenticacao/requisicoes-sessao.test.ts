import { afterEach, expect, it, vi } from "vitest"
import {
  comBloqueioSessao,
  cabecalhosDaSessao,
  renovarToken,
  solicitarLogin,
} from "../../../src/features/autenticacao/requisicoes-sessao"

afterEach(() => vi.unstubAllGlobals())

it("substitui cabeçalhos autenticados sem duplicar a empresa ou o token", () => {
  const headers = cabecalhosDaSessao(
    { "x-empresa-id": "1", authorization: "Bearer antigo", "If-Match": '"3"' },
    "novo",
    1,
  )
  expect(
    new Request("http://localhost/api/pedidos", { headers }).headers.get(
      "X-Empresa-Id",
    ),
  ).toBe("1")
  expect(headers.get("Authorization")).toBe("Bearer novo")
  expect(headers.get("If-Match")).toBe('"3"')
})
it("preserva a recusa de requisição iniciada para outra empresa", () => {
  expect(() =>
    cabecalhosDaSessao(new Headers({ "X-Empresa-Id": "2" }), "token", 1),
  ).toThrow("A empresa selecionada mudou")
})

it("um refresh atrasado não apaga o cookie criado pelo login seguinte", async () => {
  vi.stubGlobal("navigator", {})
  let cookie = "sessao-antiga"
  let liberarRefresh!: () => void
  let iniciouRefresh!: () => void
  const refreshPendente = new Promise<void>((resolve) => {
    liberarRefresh = resolve
  })
  const refreshIniciado = new Promise<void>((resolve) => {
    iniciouRefresh = resolve
  })
  const chamadas: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      chamadas.push(url)
      if (url === "/api/auth/refresh") {
        iniciouRefresh()
        await refreshPendente
        cookie = "" // Resposta 401 do refresh remove o cookie no navegador.
        return Response.json({ error: "Não autenticado." }, { status: 401 })
      }
      cookie = "sessao-nova"
      return Response.json({ accessToken: "novo-token" })
    }),
  )

  const refresh = renovarToken()
  await refreshIniciado
  const login = solicitarLogin("ana@example.com", "senha")
  await Promise.resolve()
  expect(chamadas).toEqual(["/api/auth/refresh"])

  liberarRefresh()
  expect(await refresh).toBeNull()
  expect((await login).ok).toBe(true)
  expect(chamadas).toEqual(["/api/auth/refresh", "/api/auth/login"])
  expect(cookie).toBe("sessao-nova")
})

it("uma operação com falha libera a fila para o próximo login", async () => {
  vi.stubGlobal("navigator", {})
  await expect(
    comBloqueioSessao(async () => {
      throw new Error("falha de rede")
    }),
  ).rejects.toThrow("falha de rede")
  await expect(comBloqueioSessao(async () => "continuou")).resolves.toBe(
    "continuou",
  )
})

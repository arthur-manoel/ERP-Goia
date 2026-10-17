import { afterEach, expect, it, vi } from "vitest"
import {
  comBloqueioSessao,
  renovarToken,
  solicitarLogin,
} from "../../../src/features/autenticacao/requisicoes-sessao"

afterEach(() => vi.unstubAllGlobals())

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

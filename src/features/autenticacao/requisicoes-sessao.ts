const nomeBloqueioSessao = "erp-goia-sessao"

export function cabecalhosDaSessao(
  entrada: HeadersInit | undefined,
  token: string,
  idEmpresa: number,
) {
  const headers = new Headers(entrada)
  const empresaSolicitada = headers.get("X-Empresa-Id")
  if (empresaSolicitada !== null && empresaSolicitada !== String(idEmpresa))
    throw new Error("A empresa selecionada mudou. Repita a operação.")
  headers.set("Authorization", `Bearer ${token}`)
  headers.set("X-Empresa-Id", String(idEmpresa))
  return headers
}

// A fila local também protege navegadores sem Web Locks dentro da mesma aba.
// Com Web Locks, o mesmo nome serializa as operações entre abas.
let filaLocal: Promise<void> = Promise.resolve()

export function comBloqueioSessao<T>(operacao: () => Promise<T>): Promise<T> {
  const executar = async () => {
    if (typeof navigator !== "undefined" && navigator.locks)
      return await navigator.locks.request(nomeBloqueioSessao, operacao)
    return operacao()
  }
  const resultado = filaLocal.then(executar)
  filaLocal = resultado.then(
    () => undefined,
    () => undefined,
  )
  return resultado
}

// O refresh token é rotativo. Requisições simultâneas compartilham uma única
// rotação para não revogar a sessão por reutilização acidental do cookie.
let renovacao: Promise<string | null> | null = null
export function renovarToken() {
  renovacao ??= comBloqueioSessao(async () => {
    const response = await fetch("/api/auth/refresh", { method: "POST" })
    if (!response.ok) return null
    const body: { accessToken?: string } = await response.json()
    return body.accessToken ?? null
  }).finally(() => {
    renovacao = null
  })
  return renovacao
}

export function solicitarLogin(email: string, password: string) {
  return comBloqueioSessao(() =>
    fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  )
}

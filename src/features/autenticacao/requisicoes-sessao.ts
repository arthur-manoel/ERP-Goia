const nomeBloqueioSessao = "erp-goia-sessao"

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
const renovacoes = new Map<string | undefined, Promise<string | null>>()
export function renovarToken(accessToken?: string) {
  const pendente = renovacoes.get(accessToken)
  if (pendente) return pendente
  const renovacao = comBloqueioSessao(async () => {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined,
    })
    if (response.status === 401) return null
    if (!response.ok) throw new Error("Não foi possível renovar a sessão.")
    const body: { accessToken?: string } = await response.json()
    return body.accessToken ?? null
  }).finally(() => {
    renovacoes.delete(accessToken)
  })
  renovacoes.set(accessToken, renovacao)
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

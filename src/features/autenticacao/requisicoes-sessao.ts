const nomeBloqueioSessao = "erp-goia-sessao"

export function instanteDaSessao() {
  return performance.timeOrigin + performance.now()
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
let renovacao: Promise<{
  accessToken: string
  instante: number
} | null> | null = null
export function renovarToken() {
  renovacao ??= comBloqueioSessao(async () => {
    const response = await fetch("/api/auth/refresh", { method: "POST" })
    if (response.status === 401) return null
    if (!response.ok) throw new Error("Não foi possível renovar a sessão.")
    const body: { accessToken?: string } = await response.json()
    if (!body.accessToken) throw new Error("Resposta de sessão inválida.")
    return { accessToken: body.accessToken, instante: instanteDaSessao() }
  }).finally(() => {
    renovacao = null
  })
  return renovacao
}

export function solicitarLogin(
  email: string,
  password: string,
  confirmar?: () => void,
) {
  return comBloqueioSessao(async () => {
    const resposta = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    if (resposta.ok) confirmar?.()
    return resposta
  })
}

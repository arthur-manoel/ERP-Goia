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
type SessaoRenovada = { accessToken: string; instante: number }
const renovacoes = new Map<string | undefined, Promise<SessaoRenovada | null>>()
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
    if (!body.accessToken) throw new Error("Resposta de sessão inválida.")
    return { accessToken: body.accessToken, instante: instanteDaSessao() }
  }).finally(() => {
    renovacoes.delete(accessToken)
  })
  renovacoes.set(accessToken, renovacao)
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

"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"

type Empresa = { id: number; nome: string }
type Usuario = { nome: string; email: string }
type Estado = "carregando" | "anonimo" | "autenticado"

type Contexto = {
  estado: Estado
  usuario: Usuario | null
  empresas: Empresa[]
  empresa: Empresa | null
  selecionarEmpresa: (id: number) => void
  entrar: (email: string, password: string) => Promise<void>
  sair: () => Promise<void>
  requisitar: (url: string, init?: RequestInit) => Promise<Response>
}

const AutenticacaoContexto = createContext<Contexto | null>(null)
const chaveEmpresa = "erp-goia-empresa-ativa"
const nomeBloqueioSessao = "erp-goia-sessao"
const nomeCanalSessao = "erp-goia-sessao"

async function comBloqueioSessao<T>(operacao: () => Promise<T>) {
  if (typeof navigator === "undefined" || !navigator.locks) return operacao()
  return navigator.locks.request(nomeBloqueioSessao, operacao)
}

// O refresh token é rotativo. Requisições simultâneas compartilham uma única
// rotação para não revogar a sessão por reutilização acidental do cookie.
let renovacao: Promise<string | null> | null = null
function renovarToken() {
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

async function mensagemErro(response: Response) {
  const body: { error?: string } = await response.json().catch(() => ({}))
  return body.error ?? `Falha na requisição (${response.status}).`
}

export function ProvedorAutenticacao({
  children,
}: {
  children: React.ReactNode
}) {
  const [estado, setEstado] = useState<Estado>("carregando")
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [empresa, setEmpresa] = useState<Empresa | null>(null)
  const token = useRef<string | null>(null)
  const empresaAtual = useRef<Empresa | null>(null)
  const versaoSessao = useRef(0)

  const limpar = useCallback(() => {
    versaoSessao.current += 1
    token.current = null
    empresaAtual.current = null
    setUsuario(null)
    setEmpresas([])
    setEmpresa(null)
    setEstado("anonimo")
  }, [])

  const carregarAcesso = useCallback(
    async (accessToken: string, versaoEsperada: number) => {
      const response = await fetch("/api/estoque-minimo/empresas", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      })
      if (!response.ok) throw new Error(await mensagemErro(response))
      const body: { usuario: Usuario | null; empresas: Empresa[] } =
        await response.json()
      if (versaoSessao.current !== versaoEsperada) return false

      token.current = accessToken
      setUsuario(body.usuario)
      setEmpresas(body.empresas)
      const lembrada = Number(sessionStorage.getItem(chaveEmpresa))
      const escolhida =
        body.empresas.find((item) => item.id === lembrada) ??
        (body.empresas.length === 1 ? body.empresas[0] : null)
      empresaAtual.current = escolhida
      setEmpresa(escolhida)
      setEstado("autenticado")
      return true
    },
    [],
  )

  useEffect(() => {
    let ativo = true
    const versaoInicial = versaoSessao.current

    void renovarToken().then(
      async (accessToken) => {
        if (!ativo || versaoSessao.current !== versaoInicial) return
        if (!accessToken) return limpar()
        try {
          await carregarAcesso(accessToken, versaoInicial)
        } catch {
          if (ativo && versaoSessao.current === versaoInicial) limpar()
        }
      },
      () => {
        if (ativo && versaoSessao.current === versaoInicial) limpar()
      },
    )
    return () => {
      ativo = false
    }
  }, [carregarAcesso, limpar])

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const canal = new BroadcastChannel(nomeCanalSessao)
    canal.addEventListener("message", (evento: MessageEvent<unknown>) => {
      if (evento.data !== "logout") return
      sessionStorage.removeItem(chaveEmpresa)
      limpar()
    })
    return () => canal.close()
  }, [limpar])

  const selecionarEmpresa = useCallback(
    (id: number) => {
      const escolhida = empresas.find((item) => item.id === id)
      if (!escolhida) return
      sessionStorage.setItem(chaveEmpresa, String(id))
      empresaAtual.current = escolhida
      setEmpresa(escolhida)
    },
    [empresas],
  )

  const entrar = useCallback(
    async (email: string, password: string) => {
      const versaoLogin = versaoSessao.current + 1
      versaoSessao.current = versaoLogin
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) throw new Error(await mensagemErro(response))
      const body: { accessToken: string } = await response.json()
      const carregado = await carregarAcesso(body.accessToken, versaoLogin)
      if (!carregado) throw new Error("A autenticação foi cancelada.")
    },
    [carregarAcesso],
  )

  const sair = useCallback(async () => {
    versaoSessao.current += 1
    const response = await comBloqueioSessao(() =>
      fetch("/api/auth/logout", { method: "POST" }),
    )
    if (!response.ok) throw new Error(await mensagemErro(response))

    sessionStorage.removeItem(chaveEmpresa)
    limpar()
    if (typeof BroadcastChannel !== "undefined") {
      const canal = new BroadcastChannel(nomeCanalSessao)
      canal.postMessage("logout")
      canal.close()
    }
  }, [limpar])

  const requisitar = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const versaoRequisicao = versaoSessao.current
      if (!token.current) throw new Error("Entre para acessar o estoque.")
      if (!empresaAtual.current)
        throw new Error("Selecione uma empresa para consultar o estoque.")
      const executar = (accessToken: string) =>
        fetch(url, {
          ...init,
          cache: "no-store",
          headers: {
            ...Object.fromEntries(new Headers(init.headers)),
            Authorization: `Bearer ${accessToken}`,
            "X-Empresa-Id": String(empresaAtual.current?.id),
          },
        })
      let response = await executar(token.current)
      if (versaoSessao.current !== versaoRequisicao) return response
      if (response.status === 401) {
        const novoToken = await renovarToken()
        if (versaoSessao.current !== versaoRequisicao) return response
        if (!novoToken) {
          limpar()
          return response
        }
        token.current = novoToken
        response = await executar(novoToken)
      }
      return response
    },
    [limpar],
  )

  return (
    <AutenticacaoContexto.Provider
      value={{
        estado,
        usuario,
        empresas,
        empresa,
        selecionarEmpresa,
        entrar,
        sair,
        requisitar,
      }}
    >
      {children}
    </AutenticacaoContexto.Provider>
  )
}

export function useAutenticacao() {
  const contexto = useContext(AutenticacaoContexto)
  if (!contexto) throw new Error("Provedor de autenticação ausente.")
  return contexto
}

export { mensagemErro }

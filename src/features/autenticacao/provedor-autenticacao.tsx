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

// O refresh token é rotativo. Requisições simultâneas compartilham uma única
// rotação para não revogar a sessão por reutilização acidental do cookie.
let renovacao: Promise<string | null> | null = null
function renovarToken() {
  renovacao ??= fetch("/api/auth/refresh", { method: "POST" })
    .then(async (response) => {
      if (!response.ok) return null
      const body: { accessToken?: string } = await response.json()
      return body.accessToken ?? null
    })
    .finally(() => {
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

  const limpar = useCallback(() => {
    token.current = null
    empresaAtual.current = null
    setUsuario(null)
    setEmpresas([])
    setEmpresa(null)
    setEstado("anonimo")
  }, [])

  const carregarAcesso = useCallback(async (accessToken: string) => {
    const response = await fetch("/api/estoque-minimo/empresas", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })
    if (!response.ok) throw new Error(await mensagemErro(response))
    const body: { usuario: Usuario | null; empresas: Empresa[] } =
      await response.json()
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
  }, [])

  useEffect(() => {
    let ativo = true

    void renovarToken().then(
      async (accessToken) => {
        if (!ativo) return
        if (!accessToken) return limpar()
        try {
          await carregarAcesso(accessToken)
        } catch {
          if (ativo) limpar()
        }
      },
      () => {
        if (ativo) limpar()
      },
    )
    return () => {
      ativo = false
    }
  }, [carregarAcesso, limpar])

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
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      if (!response.ok) throw new Error(await mensagemErro(response))
      const body: { accessToken: string } = await response.json()
      await carregarAcesso(body.accessToken)
    },
    [carregarAcesso],
  )

  const sair = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } finally {
      sessionStorage.removeItem(chaveEmpresa)
      limpar()
    }
  }, [limpar])

  const requisitar = useCallback(
    async (url: string, init: RequestInit = {}) => {
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
      if (response.status === 401) {
        const novoToken = await renovarToken()
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

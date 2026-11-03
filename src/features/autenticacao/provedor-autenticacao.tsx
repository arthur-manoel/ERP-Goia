"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import {
  comBloqueioSessao,
  renovarToken,
  solicitarLogin,
} from "./requisicoes-sessao"
import type {
  EmpresaSessao,
  UsuarioSessao,
  EmpresasSessao,
} from "@/modules/auth/auth.empresas.types"

type Estado = "carregando" | "anonimo" | "autenticado" | "erro"
type Contexto = {
  estado: Estado
  usuario: UsuarioSessao | null
  empresas: EmpresaSessao[]
  empresa: EmpresaSessao | null
  erroAcesso: string | null
  recarregarAcesso: () => Promise<void>
  selecionarEmpresa: (id: number) => void
  entrar: (email: string, password: string) => Promise<void>
  sair: () => Promise<void>
  requisitar: (url: string, init?: RequestInit) => Promise<Response>
}
const AutenticacaoContexto = createContext<Contexto | null>(null)
const chaveAntiga = "erp-goia-empresa-ativa"
const chaveEmpresa = (id: number) => `${chaveAntiga}:${id}`
const nomeCanalSessao = "erp-goia-sessao"
// Preferência opcional: restrições de armazenamento não podem impedir o login.
function lembrar(id: number, empresa: number | null) {
  try {
    sessionStorage.removeItem(chaveAntiga)
    if (empresa === null) sessionStorage.removeItem(chaveEmpresa(id))
    else sessionStorage.setItem(chaveEmpresa(id), String(empresa))
  } catch {
    /* Navegador sem armazenamento: manter somente em memória. */
  }
}
function preferida(id: number) {
  try {
    sessionStorage.removeItem(chaveAntiga)
    return Number(sessionStorage.getItem(chaveEmpresa(id)))
  } catch {
    return 0
  }
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
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(null)
  const [empresas, setEmpresas] = useState<EmpresaSessao[]>([])
  const [empresa, setEmpresa] = useState<EmpresaSessao | null>(null)
  const [erroAcesso, setErroAcesso] = useState<string | null>(null)
  const token = useRef<string | null>(null)
  const usuarioAtual = useRef<UsuarioSessao | null>(null)
  const empresaAtual = useRef<EmpresaSessao | null>(null)
  const versaoSessao = useRef(0)
  const versaoEmpresa = useRef(0)
  const renovacaoAcesso = useRef<{
    versao: number
    resultado: Promise<boolean | null>
  } | null>(null)
  const consulta = useRef<AbortController | null>(null)

  const esvaziar = useCallback(() => {
    consulta.current?.abort()
    token.current = null
    usuarioAtual.current = null
    empresaAtual.current = null
    setUsuario(null)
    setEmpresas([])
    setEmpresa(null)
    setErroAcesso(null)
  }, [])
  const limpar = useCallback(() => {
    if (usuarioAtual.current) lembrar(usuarioAtual.current.id, null)
    versaoSessao.current += 1
    esvaziar()
    setEstado("anonimo")
  }, [esvaziar])
  const falhaAcesso = useCallback(() => {
    empresaAtual.current = null
    setEmpresa(null)
    setEmpresas([])
    setErroAcesso(
      "Não foi possível carregar suas empresas. Verifique a conexão e tente novamente.",
    )
    setEstado("erro")
  }, [])
  const carregarAcesso = useCallback(
    async (
      accessToken: string,
      versao: number,
      silencioso = false,
      idUsuarioEsperado?: number,
    ) => {
      if (versaoSessao.current !== versao) return false
      consulta.current?.abort()
      const controller = new AbortController()
      consulta.current = controller
      if (!silencioso) {
        setEstado("carregando")
        setErroAcesso(null)
      }
      try {
        // Chamada de descoberta independente do helper de módulos/empresa ativa.
        const response = await fetch("/api/auth/empresas", {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
          signal: controller.signal,
        })
        if (controller.signal.aborted || versaoSessao.current !== versao)
          return false
        if (response.status === 401) {
          limpar()
          return false
        }
        if (!response.ok) throw new Error(await mensagemErro(response))
        const { data: body }: { data: EmpresasSessao } = await response.json()
        if (controller.signal.aborted || versaoSessao.current !== versao)
          return false
        if (
          idUsuarioEsperado !== undefined &&
          body.usuario.id !== idUsuarioEsperado
        ) {
          limpar()
          return false
        }
        const escolhida =
          body.empresas.find((e) => e.id === preferida(body.usuario.id)) ??
          (body.empresas.length === 1 ? body.empresas[0] : null)
        if (empresaAtual.current?.id !== escolhida?.id) versaoEmpresa.current++
        token.current = accessToken
        usuarioAtual.current = body.usuario
        empresaAtual.current = escolhida
        lembrar(body.usuario.id, escolhida?.id ?? null)
        setUsuario(body.usuario)
        setEmpresas(body.empresas)
        setEmpresa(escolhida)
        setErroAcesso(null)
        setEstado("autenticado")
        return true
      } catch {
        if (controller.signal.aborted || versaoSessao.current !== versao)
          return false
        falhaAcesso()
        return true // Sessão válida, descoberta falhou: a tela oferece nova tentativa.
      }
    },
    [falhaAcesso, limpar],
  )

  const restaurar = useCallback(
    (silencioso = false) => {
      const versao = versaoSessao.current
      const emCurso = renovacaoAcesso.current
      if (emCurso?.versao === versao) return emCurso.resultado
      const idUsuario = usuarioAtual.current?.id
      const resultado = renovarToken()
        .then(
          async (accessToken) => {
            if (versaoSessao.current !== versao) return false
            if (!accessToken) {
              limpar()
              return null
            }
            return carregarAcesso(accessToken, versao, silencioso, idUsuario)
          },
          () => {
            if (versaoSessao.current === versao) falhaAcesso()
            return false
          },
        )
        .finally(() => {
          if (renovacaoAcesso.current?.resultado === resultado)
            renovacaoAcesso.current = null
        })
      renovacaoAcesso.current = { versao, resultado }
      return resultado
    },
    [carregarAcesso, falhaAcesso, limpar],
  )
  useEffect(() => {
    void restaurar()
    return () => {
      versaoSessao.current += 1
      consulta.current?.abort()
    }
  }, [restaurar])
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return
    const canal = new BroadcastChannel(nomeCanalSessao)
    canal.addEventListener("message", (evento: MessageEvent<unknown>) => {
      if (evento.data === "logout") limpar()
    })
    return () => canal.close()
  }, [limpar])

  const recarregarAcesso = useCallback(async () => {
    versaoSessao.current++
    setEstado("carregando")
    setErroAcesso(null)
    consulta.current?.abort()
    await restaurar()
  }, [restaurar])
  const selecionarEmpresa = useCallback(
    (id: number) => {
      const escolhida = empresas.find((e) => e.id === id)
      if (!escolhida || !usuarioAtual.current) return
      if (empresaAtual.current?.id !== id) versaoEmpresa.current++
      lembrar(usuarioAtual.current.id, id)
      empresaAtual.current = escolhida
      setEmpresa(escolhida)
    },
    [empresas],
  )
  const entrar = useCallback(
    async (email: string, password: string) => {
      const versao = ++versaoSessao.current
      esvaziar()
      setEstado("carregando")
      let response: Response
      try {
        response = await solicitarLogin(email, password)
      } catch {
        if (versaoSessao.current === versao) {
          setEstado("anonimo")
          throw new Error("Não foi possível entrar. Verifique sua conexão.")
        }
        throw new Error("A autenticação foi cancelada.")
      }
      if (versaoSessao.current !== versao)
        throw new Error("A autenticação foi cancelada.")
      if (!response.ok) {
        setEstado("anonimo")
        throw new Error(
          response.status === 401
            ? "Usuário ou senha incorretos."
            : "Não foi possível entrar. Tente novamente.",
        )
      }
      const body: { accessToken: string } = await response.json()
      if (!(await carregarAcesso(body.accessToken, versao)))
        throw new Error("A sessão expirou ou foi cancelada. Entre novamente.")
    },
    [carregarAcesso, esvaziar],
  )
  const sair = useCallback(async () => {
    // Limpar imediatamente, mesmo quando a resposta de logout estiver atrasada.
    limpar()
    const versao = versaoSessao.current
    try {
      const response = await comBloqueioSessao(() =>
        fetch("/api/auth/logout", { method: "POST" }),
      )
      if (!response.ok) throw new Error(await mensagemErro(response))
    } finally {
      // Um logout antigo não pode apagar o login que entrou depois dele.
      if (
        versaoSessao.current === versao &&
        typeof BroadcastChannel !== "undefined"
      ) {
        const canal = new BroadcastChannel(nomeCanalSessao)
        canal.postMessage("logout")
        canal.close()
      }
    }
  }, [limpar])
  const requisitar = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const versao = versaoSessao.current
      if (!token.current) throw new Error("Entre para acessar o ERP.")
      if (!empresaAtual.current)
        throw new Error("Selecione uma empresa para continuar.")
      const idEmpresa = empresaAtual.current.id
      const selecao = versaoEmpresa.current
      const idUsuario = usuarioAtual.current?.id
      const header = new Headers(init.headers).get("X-Empresa-Id")
      if (header !== null && header !== String(idEmpresa))
        throw new Error("A empresa selecionada mudou. Repita a operação.")
      const conferir = () => {
        if (
          versaoSessao.current !== versao ||
          versaoEmpresa.current !== selecao ||
          usuarioAtual.current?.id !== idUsuario ||
          empresaAtual.current?.id !== idEmpresa
        )
          throw new DOMException("Sessão ou empresa alterada.", "AbortError")
      }
      const executar = (accessToken: string) => {
        const headers = new Headers(init.headers)
        headers.set("Authorization", `Bearer ${accessToken}`)
        headers.set("X-Empresa-Id", String(idEmpresa))
        return fetch(url, { ...init, cache: "no-store", headers })
      }
      const emCurso = renovacaoAcesso.current
      if (emCurso?.versao === versao) {
        await emCurso.resultado
        conferir()
      }
      const enviado = token.current!
      let response = await executar(enviado)
      conferir()
      if (response.status === 401) {
        if (enviado === token.current) {
          const resultado = await restaurar(true)
          if (resultado === null) return response
          conferir()
          if (!resultado)
            throw new Error(
              "Não foi possível renovar a sessão. Tente novamente.",
            )
        }
        conferir()
        response = await executar(token.current!)
        conferir()
        if (response.status === 401) limpar()
      }
      return response
    },
    [limpar, restaurar],
  )
  return (
    <AutenticacaoContexto.Provider
      value={{
        estado,
        usuario,
        empresas,
        empresa,
        erroAcesso,
        recarregarAcesso,
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

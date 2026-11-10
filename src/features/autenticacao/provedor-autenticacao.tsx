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
  instanteDaSessao,
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
type MudancaSessao = { tipo: "login" | "logout"; instante: number }
const erroRenovacao = "Não foi possível renovar a sessão. Tente novamente."
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
  const canalSessao = useRef<BroadcastChannel | null>(null)
  const ultimaMudanca = useRef(0)
  const loginPendente = useRef<number | null>(null)

  const avisarMudanca = useCallback((tipo: MudancaSessao["tipo"]) => {
    const instante = instanteDaSessao()
    ultimaMudanca.current = instante
    canalSessao.current?.postMessage({ tipo, instante } satisfies MudancaSessao)
  }, [])

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
    loginPendente.current = null
    esvaziar()
    setEstado("anonimo")
  }, [esvaziar])
  const falhaAcesso = useCallback(() => {
    setErroAcesso(
      "Não foi possível carregar suas empresas. Verifique a conexão e tente novamente.",
    )
    setEstado(empresaAtual.current ? "autenticado" : "erro")
  }, [])
  const carregarAcesso = useCallback(
    async (
      accessToken: string,
      versao: number,
      silencioso = false,
      idUsuarioEsperado?: number,
      instante?: number,
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
        // Consulte a seleção depois da resposta: ela pode ter mudado durante o refresh.
        const atual = empresaAtual.current
        const mesmaSessao = usuarioAtual.current?.id === body.usuario.id
        const idEmpresa = mesmaSessao ? atual?.id : preferida(body.usuario.id)
        const validada =
          body.empresas.find((e) => e.id === idEmpresa) ??
          (!mesmaSessao && body.empresas.length === 1 ? body.empresas[0] : null)
        const escolhida =
          atual?.id === validada?.id && atual?.nome === validada?.nome
            ? atual
            : validada
        if (atual?.id !== escolhida?.id) versaoEmpresa.current++
        if (instante !== undefined && usuarioAtual.current === null)
          ultimaMudanca.current = Math.max(ultimaMudanca.current, instante)
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
        return !silencioso
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
          async (sessao) => {
            if (versaoSessao.current !== versao) return false
            if (!sessao) {
              limpar()
              return null
            }
            return carregarAcesso(
              sessao.accessToken,
              versao,
              silencioso,
              idUsuario,
              sessao.instante,
            )
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
    let canal: BroadcastChannel
    try {
      canal = new BroadcastChannel(nomeCanalSessao)
    } catch {
      return
    }
    canalSessao.current = canal
    canal.addEventListener("message", (evento: MessageEvent<unknown>) => {
      if (evento.data === "logout") {
        if (loginPendente.current === null) limpar()
        return
      }
      const mudanca = evento.data as Partial<MudancaSessao> | null
      if (
        (mudanca?.tipo !== "logout" && mudanca?.tipo !== "login") ||
        typeof mudanca.instante !== "number" ||
        !Number.isFinite(mudanca.instante) ||
        mudanca.instante < ultimaMudanca.current
      )
        return
      ultimaMudanca.current = mudanca.instante
      // O POST de login que aguarda a fila recebe o cookie depois do aviso anterior.
      if (loginPendente.current === null) limpar()
    })
    return () => {
      canalSessao.current = null
      canal.close()
    }
  }, [limpar])

  const recarregarAcesso = useCallback(async () => {
    const silencioso = empresaAtual.current !== null
    if (!silencioso) {
      setEstado("carregando")
      setErroAcesso(null)
    }
    await restaurar(silencioso)
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
      loginPendente.current = versao
      setEstado("carregando")
      let response: Response
      try {
        response = await solicitarLogin(email, password, () => {
          if (loginPendente.current === versao) loginPendente.current = null
          // A confirmação HTTP troca o cookie mesmo se a UI cancelou este login.
          avisarMudanca("login")
        })
      } catch {
        if (versaoSessao.current === versao) {
          setEstado("anonimo")
          throw new Error("Não foi possível entrar. Verifique sua conexão.")
        }
        throw new Error("A autenticação foi cancelada.")
      } finally {
        if (loginPendente.current === versao) loginPendente.current = null
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
    [avisarMudanca, carregarAcesso, esvaziar],
  )
  const sair = useCallback(async () => {
    // Limpar imediatamente, mesmo quando a resposta de logout estiver atrasada.
    limpar()
    const versao = versaoSessao.current
    await comBloqueioSessao(async () => {
      if (versaoSessao.current !== versao) return
      const response = await fetch("/api/auth/logout", { method: "POST" })
      if (!response.ok) throw new Error(await mensagemErro(response))
      // Só a confirmação HTTP limpa o cookie compartilhado.
      avisarMudanca("logout")
    })
  }, [avisarMudanca, limpar])
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
        const resultado = await emCurso.resultado
        conferir()
        if (!resultado) throw new Error(erroRenovacao)
      }
      const enviado = token.current!
      let response = await executar(enviado)
      conferir()
      if (response.status === 401) {
        if (enviado === token.current) {
          const resultado = await restaurar(true)
          if (resultado === null) return response
          conferir()
          if (!resultado) throw new Error(erroRenovacao)
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

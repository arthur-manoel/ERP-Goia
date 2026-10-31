"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { foiCancelada, mensagemDeErro } from "@/lib/listagem/contratos"
import {
  chaveCriterios,
  derivarEstado,
  paginaCorrigida,
  proximaOrdenacao,
  type ConsultaConcluida,
  type EstadoListagem,
} from "@/lib/listagem/estado"
import type {
  FiltrosListagem,
  FonteListagem,
  OrdenacaoListagem,
  ResultadoPagina,
} from "@/lib/listagem/tipos"

export type OpcoesListagem<T, M = undefined> = {
  /** Mantenha a referência estável (useMemo): trocar a fonte volta à página 1 e recarrega. */
  fonte: FonteListagem<T, M>
  limite?: number
  filtrosIniciais?: FiltrosListagem
  /** Espera, em ms, após a última tecla antes de consultar a API. */
  atrasoBusca?: number
}

export type ControleListagem<T, M = undefined> = {
  estado: EstadoListagem
  itens: T[]
  meta: M | undefined
  erro: string
  /** Há dados anteriores na tela enquanto uma nova consulta está em andamento. */
  atualizando: boolean
  pagina: number
  limite: number
  total: number
  totalPaginas: number
  irParaPagina: (pagina: number) => void
  busca: string
  definirBusca: (valor: string) => void
  filtros: FiltrosListagem
  definirFiltro: (chave: string, valor: string) => void
  limparFiltros: () => void
  possuiFiltros: boolean
  ordenacao: OrdenacaoListagem | null
  alternarOrdenacao: (campo: string) => void
  recarregar: () => void
}

const idsDasFontes = new WeakMap<object, number>()
let proximoId = 1
function idDaFonte(fonte: object) {
  let id = idsDasFontes.get(fonte)
  if (id === undefined) {
    id = proximoId++
    idsDasFontes.set(fonte, id)
  }
  return id
}

/**
 * Estado de uma listagem paginada: busca com debounce, filtros, ordenação,
 * paginação no servidor (ou local, conforme a fonte), recarga e tratamento de
 * erro. Qualquer mudança nos critérios (busca aplicada, filtros, ordenação,
 * limite ou fonte) volta à página 1 sem efeitos extras, pois a página é guardada
 * junto da chave dos critérios em que foi escolhida.
 */
export function useListagem<T, M = undefined>({
  fonte,
  limite = 20,
  filtrosIniciais,
  atrasoBusca = 350,
}: OpcoesListagem<T, M>): ControleListagem<T, M> {
  const [busca, setBusca] = useState("")
  const [buscaAplicada, setBuscaAplicada] = useState("")
  const [filtros, setFiltros] = useState<FiltrosListagem>(
    () => filtrosIniciais ?? {},
  )
  const [ordenacao, setOrdenacao] = useState<OrdenacaoListagem | null>(null)
  const [versao, setVersao] = useState(0)
  const [escolhida, setEscolhida] = useState({ pagina: 1, chave: "" })
  const [consulta, setConsulta] = useState<
    ConsultaConcluida<T, M> & { idFonte: number }
  >({ chave: "", dados: null, erro: "", idFonte: 0 })

  useEffect(() => {
    const tempo = setTimeout(() => setBuscaAplicada(busca.trim()), atrasoBusca)
    return () => clearTimeout(tempo)
  }, [busca, atrasoBusca])

  const idFonte = idDaFonte(fonte)
  const criterios = `${idFonte}|${chaveCriterios(buscaAplicada, filtros, ordenacao, limite)}`
  const pagina = escolhida.chave === criterios ? escolhida.pagina : 1
  const chaveConsulta = `${criterios}|${pagina}|${versao}`

  useEffect(() => {
    let ativo = true
    const controlador = new AbortController()
    fonte
      .buscar(
        { pagina, limite, busca: buscaAplicada, filtros, ordenacao },
        controlador.signal,
      )
      .then(
        (dados: ResultadoPagina<T, M>) => {
          if (!ativo) return
          const corrigida = paginaCorrigida(pagina, dados)
          if (corrigida !== null) {
            setEscolhida({ pagina: corrigida, chave: criterios })
            return
          }
          setConsulta({ chave: chaveConsulta, dados, erro: "", idFonte })
        },
        (causa: unknown) => {
          if (!ativo || foiCancelada(causa)) return
          setConsulta((atual) => ({
            chave: chaveConsulta,
            dados: atual.idFonte === idFonte ? atual.dados : null,
            erro: mensagemDeErro(causa),
            idFonte,
          }))
        },
      )
    return () => {
      ativo = false
      controlador.abort()
    }
  }, [
    fonte,
    pagina,
    limite,
    buscaAplicada,
    filtros,
    ordenacao,
    criterios,
    chaveConsulta,
    idFonte,
  ])

  // Dados de outra fonte (ex.: outra empresa) nunca ficam na tela, nem
  // esmaecidos: só a mesma fonte pode mostrar o resultado anterior enquanto
  // recarrega.
  const dados = consulta.idFonte === idFonte ? consulta.dados : null
  const { estado, atualizando, erro } = derivarEstado(
    { ...consulta, dados },
    chaveConsulta,
  )

  const definirFiltro = useCallback(
    (chave: string, valor: string) =>
      setFiltros((atual) => ({ ...atual, [chave]: valor })),
    [],
  )
  const limparFiltros = useCallback(() => {
    // A busca é aplicada na hora: sem espera, evita uma consulta intermediária.
    setBusca("")
    setBuscaAplicada("")
    setFiltros({})
  }, [])
  const alternarOrdenacao = useCallback(
    (campo: string) => setOrdenacao((atual) => proximaOrdenacao(atual, campo)),
    [],
  )
  const irParaPagina = useCallback(
    (destino: number) =>
      setEscolhida({
        pagina: Math.max(1, Math.trunc(destino)),
        chave: criterios,
      }),
    [criterios],
  )
  const recarregar = useCallback(() => {
    fonte.invalidar?.()
    setVersao((v) => v + 1)
  }, [fonte])

  const possuiFiltros = useMemo(
    () =>
      busca.trim() !== "" ||
      Object.values(filtros).some((valor) => valor.trim() !== ""),
    [busca, filtros],
  )

  return {
    estado,
    itens: dados?.itens ?? [],
    meta: dados?.meta,
    erro,
    atualizando,
    pagina,
    limite,
    total: dados?.total ?? 0,
    totalPaginas: dados?.totalPaginas ?? 1,
    irParaPagina,
    busca,
    definirBusca: setBusca,
    filtros,
    definirFiltro,
    limparFiltros,
    possuiFiltros,
    ordenacao,
    alternarOrdenacao,
    recarregar,
  }
}

"use client"
import { useEffect, useState } from "react"
import { mensagem, type ComprasApi } from "./api"

/** Carrega uma listagem paginada/filtrada. `carregando` é derivado da chave da consulta. */
export function useLista<T>(
  api: ComprasApi,
  rota: string,
  filtros: Record<string, string | undefined>,
  pagina: number,
) {
  const [versao, setVersao] = useState(0)
  const parametros = new URLSearchParams({
    pagina: String(pagina),
    limite: "20",
  })
  for (const [chave, valor] of Object.entries(filtros))
    if (valor) parametros.set(chave, valor)
  const url = `${rota}?${parametros.toString()}`
  const chave = `${url}#${versao}`
  const [resultado, setResultado] = useState<{
    chave: string
    dados: T | null
    erro: string
  }>({
    chave: "",
    dados: null,
    erro: "",
  })

  useEffect(() => {
    let ativo = true
    api.get<T>(url).then(
      (dados) => ativo && setResultado({ chave, dados, erro: "" }),
      (erro: unknown) =>
        ativo &&
        setResultado((atual) => ({
          ...atual,
          chave,
          erro: mensagem(erro, "Falha ao carregar a listagem."),
        })),
    )
    return () => {
      ativo = false
    }
  }, [api, url, chave])

  return {
    dados: resultado.dados,
    erro: resultado.chave === chave ? resultado.erro : "",
    carregando: resultado.chave !== chave,
    recarregar: () => setVersao((v) => v + 1),
  }
}

export function useAtraso<T>(valor: T, ms = 350) {
  const [atrasado, setAtrasado] = useState(valor)
  useEffect(() => {
    const id = setTimeout(() => setAtrasado(valor), ms)
    return () => clearTimeout(id)
  }, [valor, ms])
  return atrasado
}

/** Carrega um registro (detalhe). `url` nulo = nada selecionado. */
export function useDetalhe<T>(
  api: ComprasApi,
  url: string | null,
  versao: number,
) {
  const chave = url ? `${url}#${versao}` : ""
  const [res, setRes] = useState<{
    chave: string
    dados: T | null
    erro: string
  }>({ chave: "", dados: null, erro: "" })
  useEffect(() => {
    if (!url) return
    let vivo = true
    api.get<T>(url).then(
      (dados) => vivo && setRes({ chave, dados, erro: "" }),
      (e: unknown) =>
        vivo &&
        setRes({
          chave,
          dados: null,
          erro: mensagem(e, "Falha ao carregar o registro."),
        }),
    )
    return () => {
      vivo = false
    }
  }, [api, url, chave])
  const atual = res.chave === chave
  return {
    dados: atual ? res.dados : null,
    erro: atual ? res.erro : "",
    carregando: Boolean(url) && !atual,
  }
}

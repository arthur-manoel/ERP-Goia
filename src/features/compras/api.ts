"use client"
import { useMemo } from "react"
import {
  useAutenticacao,
  mensagemErro,
} from "@/features/autenticacao/provedor-autenticacao"

export type ComprasApi = {
  get: <T>(url: string) => Promise<T>
  enviar: <T>(
    url: string,
    metodo: "POST" | "PATCH",
    corpo: unknown,
  ) => Promise<T>
}

/** Cliente da API de compras: injeta Bearer e X-Empresa-Id (via `requisitar`) e padroniza erros. */
export function useComprasApi(): ComprasApi {
  const { requisitar } = useAutenticacao()
  return useMemo(
    () => ({
      async get<T>(url: string) {
        const resposta = await requisitar(url)
        if (!resposta.ok) throw new Error(await mensagemErro(resposta))
        return (await resposta.json()) as T
      },
      async enviar<T>(url: string, metodo: "POST" | "PATCH", corpo: unknown) {
        const resposta = await requisitar(url, {
          method: metodo,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        })
        if (!resposta.ok) throw new Error(await mensagemErro(resposta))
        return (await resposta.json()) as T
      },
    }),
    [requisitar],
  )
}

export const BASE = "/api/compras"
export const mensagem = (
  erro: unknown,
  padrao = "Não foi possível concluir a operação.",
) => (erro instanceof Error ? erro.message : padrao)

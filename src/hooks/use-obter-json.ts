"use client"

import { useCallback } from "react"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { RespostaInvalidaError } from "@/lib/listagem/contratos"
import type { ObterJson } from "@/lib/listagem/tipos"

/**
 * GET autenticado que reaproveita o `requisitar` da sessão (Bearer, empresa
 * ativa e renovação de token): não existe um segundo cliente HTTP. Falhas HTTP
 * viram `Error` com a mensagem devolvida pela API.
 */
export function useObterJson(): ObterJson {
  const { requisitar } = useAutenticacao()
  return useCallback(
    async (url, sinal) => {
      const resposta = await requisitar(url, { signal: sinal })
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      try {
        return (await resposta.json()) as unknown
      } catch {
        throw new RespostaInvalidaError("JSON inválido")
      }
    },
    [requisitar],
  )
}

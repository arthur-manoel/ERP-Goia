"use client"
import { useEffect, useState } from "react"
import {
  useAutenticacao,
  mensagemErro,
} from "@/features/autenticacao/provedor-autenticacao"
import type {
  listarLancamentos,
  detalheLancamento,
  consultarOpcoesLancamentos,
} from "@/modules/lancamentos-financeiros/service"

export type Livro = Awaited<ReturnType<typeof listarLancamentos>>
export type Lancamento = Awaited<ReturnType<typeof detalheLancamento>>
export type Opcoes = Awaited<ReturnType<typeof consultarOpcoesLancamentos>>
export const rotaLancamentos = "/api/financeiro/lancamentos"

export function useConsultaFinanceira<T>(url: string | null, revisao = 0) {
  const { requisitar, chaveEmpresa, conferirEmpresa } = useAutenticacao()
  const chave = url ? JSON.stringify([url, revisao, chaveEmpresa]) : null
  const [resultado, setResultado] = useState<{
    chave: string
    dados?: T
    erro?: string
    status?: number
  }>()
  useEffect(() => {
    if (!url || !chave) return
    const controller = new AbortController()
    void (async () => {
      try {
        const r = await requisitar(url, { signal: controller.signal })
        const res = r.ok
          ? { dados: (await r.json()).data as T }
          : { erro: await mensagemErro(r), status: r.status }
        conferirEmpresa(chaveEmpresa)
        if (!controller.signal.aborted) setResultado({ chave, ...res })
      } catch {
        if (!controller.signal.aborted) {
          try {
            conferirEmpresa(chaveEmpresa)
          } catch {
            return
          }
          setResultado({
            chave,
            erro: "Falha de comunicação. Tente novamente.",
          })
        }
      }
    })()
    return () => controller.abort()
  }, [chave, url, requisitar, chaveEmpresa, conferirEmpresa])
  return resultado?.chave === chave ? resultado : undefined
}

export function moedaLivro(decimal: string) {
  const [reais, centavos = "00"] = decimal.replace(/^-/, "").split(".")
  return `${decimal.startsWith("-") ? "−" : ""}R$ ${BigInt(reais).toLocaleString("pt-BR")},${centavos}`
}

export const nomesOrigem = {
  RECEBIMENTO: "Recebimento de título",
  PAGAMENTO: "Pagamento de título",
  DESPESA: "Despesa",
  AJUSTE: "Lançamento manual / ajuste",
  TRANSFERENCIA: "Transferência",
  REEMBOLSO: "Reembolso",
} as const
export const diaExibido = (data: string) => data.split("-").reverse().join("/")

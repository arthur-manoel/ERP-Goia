"use client"
import { useEffect, useState } from "react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"

export type Catalogo = Awaited<
  ReturnType<
    typeof import("@/modules/movimentacoes-estoque/catalogo").consultarCatalogo
  >
>
export type Kardex = Awaited<
  ReturnType<
    typeof import("@/modules/kardex/kardex.repository").consultarKardex
  >
>
export type Movimentos = Awaited<
  ReturnType<
    typeof import("@/modules/movimentacoes-estoque/historico").consultarMovimentos
  >
>
export type Saldo = Awaited<
  ReturnType<
    typeof import("@/modules/movimentacoes-estoque/movimentacoes-estoque.repository").consultarSaldo
  >
>

export async function mensagem(response: Response) {
  const body = await response.json().catch(() => null)
  return typeof body?.error === "string"
    ? body.error
    : response.status === 403
      ? "Você não tem permissão para esta consulta."
      : `Não foi possível concluir a solicitação (HTTP ${response.status}).`
}

export function useConsultaEstoque<T>(url: string | null, revisao = 0) {
  const { requisitar, chaveEmpresa, conferirEmpresa } = useAutenticacao()
  const chave = url ? JSON.stringify([chaveEmpresa, url, revisao]) : null
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
        const valor = r.ok
          ? { dados: (await r.json()) as T }
          : { erro: await mensagem(r), status: r.status }
        conferirEmpresa(chaveEmpresa)
        if (!controller.signal.aborted) setResultado({ chave, ...valor })
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
  }, [url, chave, requisitar, chaveEmpresa, conferirEmpresa])
  return resultado?.chave === chave ? resultado : undefined
}

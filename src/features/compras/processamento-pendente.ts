"use client"
import { useCallback, useMemo, useSyncExternalStore } from "react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
export type TentativaNota = {
  idNota: number
  url: string
  chave: string
  body: unknown
}
export function useProcessamentoPendente() {
  const { usuario, empresa } = useAutenticacao(),
    key = `erp-nota-entrada:${usuario?.email}:${empresa?.id}`
  const assinar = useCallback((fn: () => void) => {
    window.addEventListener("storage", fn)
    return () => window.removeEventListener("storage", fn)
  }, [])
  const snapshot = useCallback(() => {
    try {
      return sessionStorage.getItem(key)
    } catch {
      return null
    }
  }, [key])
  const raw = useSyncExternalStore(assinar, snapshot, () => null)
  const tentativa = useMemo<TentativaNota | null>(() => {
    try {
      const p = raw ? JSON.parse(raw) : null
      return p &&
        Number.isSafeInteger(p.idNota) &&
        typeof p.chave === "string" &&
        p.url === `/api/compras/notas-fiscais/${p.idNota}/processar`
        ? p
        : null
    } catch {
      return null
    }
  }, [raw])
  function gravar(p: TentativaNota) {
    sessionStorage.setItem(key, JSON.stringify(p))
    window.dispatchEvent(new Event("storage"))
  }
  function limpar() {
    sessionStorage.removeItem(key)
    window.dispatchEvent(new Event("storage"))
  }
  return { tentativa, gravar, limpar }
}

"use client"
import { useState } from "react"
import { toast } from "sonner"
import { mensagem } from "./api"

/** Executa uma ação assíncrona com estado de ocupado, erro inline e toast de sucesso. */
export function useExecutar() {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState("")
  async function executar<T>(fn: () => Promise<T>, sucesso?: string): Promise<T | null> {
    setOcupado(true)
    setErro("")
    try {
      const r = await fn()
      if (sucesso) toast.success(sucesso)
      return r
    } catch (e) {
      setErro(mensagem(e))
      return null
    } finally {
      setOcupado(false)
    }
  }
  return { ocupado, erro, setErro, executar }
}

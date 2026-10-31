"use client"
import { useEffect, useState } from "react"

export function useConsultaCliente<T>(
  chave: string,
  consultar: (signal: AbortSignal) => Promise<T>,
) {
  const [resultado, setResultado] = useState<{
    chave: string
    dados: T | null
    erro: string | null
  } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void consultar(controller.signal).then(
      (dados) => {
        if (!controller.signal.aborted)
          setResultado({ chave, dados, erro: null })
      },
      (causa: unknown) => {
        if (!controller.signal.aborted)
          setResultado({
            chave,
            dados: null,
            erro:
              causa instanceof Error
                ? causa.message
                : "Não foi possível consultar os dados.",
          })
      },
    )
    return () => controller.abort()
  }, [chave, consultar])
  const carregando = resultado?.chave !== chave
  return {
    carregando,
    dados: carregando ? null : (resultado?.dados ?? null),
    erro: carregando ? null : (resultado?.erro ?? null),
  }
}

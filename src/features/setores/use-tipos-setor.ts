"use client"

import { useCallback, useEffect, useState } from "react"
import { listarTipos, type Requisitar } from "./api"
import type { TipoSetor } from "./tipos"

/** Tipos reais (`tipos_setor`) da empresa. Use dentro de um componente com `key={empresa.id}`. */
export function useTiposSetor(requisitar: Requisitar, idEmpresa: number) {
  const [versao, setVersao] = useState(0)
  const [resultado, setResultado] = useState<{
    versao: number
    tipos: TipoSetor[]
    erro: string
  } | null>(null)

  useEffect(() => {
    const controlador = new AbortController()
    listarTipos(requisitar, idEmpresa, { sinal: controlador.signal }).then(
      (tipos) => {
        if (!controlador.signal.aborted)
          setResultado({ versao, tipos, erro: "" })
      },
      (causa: unknown) => {
        if (controlador.signal.aborted) return
        setResultado({
          versao,
          tipos: [],
          erro:
            causa instanceof Error
              ? causa.message
              : "Não foi possível carregar os tipos de setor.",
        })
      },
    )
    return () => controlador.abort()
  }, [requisitar, idEmpresa, versao])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])
  return {
    tipos: resultado?.tipos ?? [],
    carregando: resultado?.versao !== versao,
    erro: resultado?.erro ?? "",
    recarregar,
  }
}

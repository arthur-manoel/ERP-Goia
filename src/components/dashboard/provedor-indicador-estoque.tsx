"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import type { InsumosAbaixoDoMinimo } from "@/lib/dashboard/tipos"

type ContextoIndicadorEstoque = {
  estado: "carregando" | "anonimo" | "autenticado"
  empresas: { id: number; nome: string }[]
  empresa: { id: number; nome: string } | null
  dados: InsumosAbaixoDoMinimo | null
  falha: boolean
}

const Contexto = createContext<ContextoIndicadorEstoque | null>(null)

export function ProvedorIndicadorEstoque({
  children,
}: {
  children: React.ReactNode
}) {
  const { estado, usuario, empresas, empresa, requisitar } = useAutenticacao()
  const chave = usuario && empresa ? `${usuario.email}:${empresa.id}` : null
  const [resultado, setResultado] = useState<{
    chave: string
    dados?: InsumosAbaixoDoMinimo
    falha?: boolean
  } | null>(null)

  useEffect(() => {
    if (estado !== "autenticado" || !chave) return
    let ativo = true
    void requisitar("/api/estoque-minimo")
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao consultar estoque.")
        const body: { indicador: InsumosAbaixoDoMinimo } = await response.json()
        if (ativo) setResultado({ chave, dados: body.indicador })
      })
      .catch(() => {
        if (ativo) setResultado({ chave, falha: true })
      })
    return () => {
      ativo = false
    }
  }, [estado, chave, requisitar])

  return (
    <Contexto.Provider
      value={{
        estado,
        empresas,
        empresa,
        dados: resultado?.chave === chave ? (resultado.dados ?? null) : null,
        falha: resultado?.chave === chave && resultado.falha === true,
      }}
    >
      {children}
    </Contexto.Provider>
  )
}

export function useIndicadorEstoque() {
  const contexto = useContext(Contexto)
  if (!contexto) throw new Error("Provedor do indicador de estoque ausente.")
  return contexto
}

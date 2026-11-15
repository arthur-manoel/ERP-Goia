"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import type {
  ResultadoIndicador,
  OrdensProducaoAbertas,
  PedidosAEntregar,
  SaldoDoMes,
} from "@/lib/dashboard/tipos"

type Dados = {
  ordens: OrdensProducaoAbertas
  pedidos: PedidosAEntregar
  saldo: SaldoDoMes
}
type Resultados = { [K in keyof Dados]?: ResultadoIndicador<Dados[K]> }
const Contexto = createContext<Resultados>({})

export function ProvedorIndicadores({
  children,
}: {
  children: React.ReactNode
}) {
  const { estado, usuario, empresa, requisitar } = useAutenticacao()
  const chave =
    estado === "autenticado" && usuario && empresa
      ? `${usuario.email}:${empresa.id}`
      : null
  const [resultado, setResultado] = useState<{
    chave: string
    dados: Resultados
  } | null>(null)
  useEffect(() => {
    if (!chave) return
    let ativo = true
    for (const indicador of ["ordens", "pedidos", "saldo"] as const) {
      void requisitar(`/api/dashboard/${indicador}`)
        .then(async (response) => {
          if (response.status === 403)
            return { estado: "sem_permissao" } as const
          if (!response.ok) throw new Error("Falha ao consultar indicador.")
          return (await response.json()).data as ResultadoIndicador<
            Dados[typeof indicador]
          >
        })
        .catch(() => ({ estado: "erro" }) as const)
        .then((dados) => {
          if (ativo)
            setResultado((anterior) => ({
              chave,
              dados: {
                ...(anterior?.chave === chave ? anterior.dados : {}),
                [indicador]: dados,
              },
            }))
        })
    }
    return () => {
      ativo = false
    }
  }, [chave, requisitar])
  return (
    <Contexto.Provider
      value={resultado?.chave === chave ? resultado.dados : {}}
    >
      {children}
    </Contexto.Provider>
  )
}

export function useIndicador<K extends keyof Dados>(
  indicador: K,
): ResultadoIndicador<Dados[K]> | undefined {
  return useContext(Contexto)[indicador]
}

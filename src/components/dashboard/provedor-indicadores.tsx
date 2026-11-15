"use client"

import Link from "next/link"
import { createContext, useContext, useEffect, useState } from "react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { SeletorEmpresa } from "@/features/autenticacao/seletor-empresa"
import type { ResultadoIndicador } from "@/lib/dashboard/tipos"
import {
  carregarIndicadores,
  type DadosIndicadores,
  type ResultadosIndicadores,
  type RequisitarIndicador,
} from "./carregar-indicadores"

const Contexto = createContext<ResultadosIndicadores>({})

export function ProvedorIndicadores({
  children,
}: {
  children: React.ReactNode
}) {
  const { estado, usuario, empresa, empresas, requisitar } = useAutenticacao()
  if (estado === "carregando")
    return <p role="status">Carregando acesso à dashboard…</p>
  if (estado === "anonimo" || !usuario)
    return (
      <p>
        <Link href="/login" className="underline">
          Entre
        </Link>{" "}
        para consultar a dashboard.
      </p>
    )
  return (
    <>
      {empresas.length > 1 && <SeletorEmpresa />}
      {empresa ? (
        <CarregadorIndicadores
          key={`${usuario.email}:${empresa.id}`}
          requisitar={requisitar}
        >
          {children}
        </CarregadorIndicadores>
      ) : (
        <p role="status">
          {empresas.length
            ? "Selecione uma empresa para consultar os indicadores."
            : "Sem acesso a uma empresa ativa."}
        </p>
      )}
    </>
  )
}

// A chave do componente reinicia todo o estado ao mudar usuário ou empresa.
function CarregadorIndicadores({
  children,
  requisitar,
}: {
  children: React.ReactNode
  requisitar: RequisitarIndicador
}) {
  const [dados, setDados] = useState<ResultadosIndicadores>({})
  useEffect(
    () =>
      carregarIndicadores(requisitar, (resultado) =>
        setDados((anterior) => ({ ...anterior, ...resultado })),
      ),
    [requisitar],
  )
  return <Contexto.Provider value={dados}>{children}</Contexto.Provider>
}

export function useIndicador<K extends keyof DadosIndicadores>(
  indicador: K,
): ResultadoIndicador<DadosIndicadores[K]> | undefined {
  return useContext(Contexto)[indicador]
}

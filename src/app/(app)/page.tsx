import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"
import { AvisoDadosMock } from "@/components/dashboard/aviso-dados-mock"
import { AlertaEstoqueMinimo } from "@/components/dashboard/alerta-estoque-minimo"
import { IndicadoresPrincipais } from "@/components/dashboard/indicadores-principais"
import { ProvedorIndicadorEstoque } from "@/components/dashboard/provedor-indicador-estoque"
import { ResumoAtencao } from "@/components/dashboard/resumo-atencao"
import { PageHeader } from "@/components/layout/page-header"
import { usarDadosMock } from "@/lib/dashboard/fonte"
import { podeVerSaldoDoMes } from "@/lib/dashboard/permissoes"

export const metadata: Metadata = { title: "Dashboard" }

export default async function Page() {
  await connection()
  // Decidido no servidor, antes de renderizar: sem permissão, o card do saldo
  // nem entra na página (e obterSaldoDoMes confere a permissão de novo).
  const mostrarSaldo = await podeVerSaldoDoMes()

  return (
    <>
      <PageHeader
        titulo="Dashboard"
        descricao="Visão geral da operação da empresa."
      />
      <ProvedorIndicadorEstoque>
        {usarDadosMock() && <AvisoDadosMock />}
        <Suspense fallback={null}>
          <ResumoAtencao mostrarSaldo={mostrarSaldo} />
        </Suspense>
        <AlertaEstoqueMinimo />
        <IndicadoresPrincipais mostrarSaldo={mostrarSaldo} />
      </ProvedorIndicadorEstoque>
      {/* Próximas seções da Dashboard (gráficos, listas) entram aqui, como
          componentes de components/dashboard, sem mexer nos indicadores. */}
    </>
  )
}

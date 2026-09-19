import type { Metadata } from "next"
import { Suspense } from "react"
import { AvisoDadosMock } from "@/components/dashboard/aviso-dados-mock"
import { IndicadoresPrincipais } from "@/components/dashboard/indicadores-principais"
import { ResumoAtencao } from "@/components/dashboard/resumo-atencao"
import { PageHeader } from "@/components/layout/page-header"
import { usarDadosMock } from "@/lib/dashboard/fonte"
import { podeVerSaldoDoMes } from "@/lib/dashboard/permissoes"

export const metadata: Metadata = { title: "Dashboard" }

export default async function Page() {
  // Decidido no servidor, antes de renderizar: sem permissão, o card do saldo
  // nem entra na página (e obterSaldoDoMes confere a permissão de novo).
  const mostrarSaldo = await podeVerSaldoDoMes()

  return (
    <>
      <PageHeader
        titulo="Dashboard"
        descricao="Visão geral da operação da empresa."
      />
      {usarDadosMock() && <AvisoDadosMock />}
      <Suspense fallback={null}>
        <ResumoAtencao mostrarSaldo={mostrarSaldo} />
      </Suspense>
      <IndicadoresPrincipais mostrarSaldo={mostrarSaldo} />
      {/* Próximas seções da Dashboard (gráficos, listas) entram aqui, como
          componentes de components/dashboard, sem mexer nos indicadores. */}
    </>
  )
}

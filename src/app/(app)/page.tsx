import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"
import { ProvedorIndicadores } from "@/components/dashboard/provedor-indicadores"
import { AlertaEstoqueMinimo } from "@/components/dashboard/alerta-estoque-minimo"
import { IndicadoresPrincipais } from "@/components/dashboard/indicadores-principais"
import { ResumoAtencao } from "@/components/dashboard/resumo-atencao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Dashboard" }

export default async function Page() {
  await connection()
  return (
    <>
      <PageHeader
        titulo="Dashboard"
        descricao="Visão geral da operação da empresa."
      />
      <ProvedorIndicadores>
        <Suspense fallback={null}>
          <ResumoAtencao />
        </Suspense>
        <AlertaEstoqueMinimo />
        <IndicadoresPrincipais />
      </ProvedorIndicadores>
      {/* Próximas seções da Dashboard (gráficos, listas) entram aqui, como
          componentes de components/dashboard, sem mexer nos indicadores. */}
    </>
  )
}

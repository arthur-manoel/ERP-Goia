import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Início" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Início"
        descricao="Visão geral da operação da empresa."
      />
      <EmConstrucao tabelas={["empresas"]} />
    </>
  )
}

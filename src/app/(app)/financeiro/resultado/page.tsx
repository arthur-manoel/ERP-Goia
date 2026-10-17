import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { RelatorioResultado } from "@/components/financeiro/relatorio-resultado"

export const metadata: Metadata = { title: "Relatório de resultado" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Relatório de resultado"
        descricao="Receita, saídas e margem apurada no período."
      />
      <RelatorioResultado />
    </>
  )
}

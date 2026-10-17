import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { FluxoCaixa } from "@/components/financeiro/fluxo-caixa"

export const metadata: Metadata = { title: "Fluxo de caixa" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Fluxo de caixa"
        descricao="Entradas e saídas por período, saldo projetado e contas em atraso."
      />
      <FluxoCaixa />
    </>
  )
}

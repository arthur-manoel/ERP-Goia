import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Saldos de estoque" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Saldos de estoque"
        descricao="Saldo por produto, local e setor."
      />
      <EmConstrucao tabelas={["estoque"]} />
    </>
  )
}

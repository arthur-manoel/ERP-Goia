import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Locais de estoque" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Locais de estoque"
        descricao="Depósitos e locais físicos de estoque."
      />
      <EmConstrucao tabelas={["locais_estoque"]} />
    </>
  )
}

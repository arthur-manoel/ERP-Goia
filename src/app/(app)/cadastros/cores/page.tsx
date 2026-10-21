import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Cores" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Cores"
        descricao="Cores usadas nas variações de produto."
      />
      <EmConstrucao tabelas={["cores"]} />
    </>
  )
}

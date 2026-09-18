import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Tamanhos" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Tamanhos"
        descricao="Tamanhos usados nas variações de produto."
      />
      <EmConstrucao tabelas={["tamanhos"]} />
    </>
  )
}

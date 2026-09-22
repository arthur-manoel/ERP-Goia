import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Fichas técnicas" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Fichas técnicas"
        descricao="Composição dos produtos, com versões e perdas."
      />
      <EmConstrucao tabelas={["ficha_tecnica", "ficha_tecnica_item"]} />
    </>
  )
}

import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Categorias" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Categorias"
        descricao="Categorias para organizar os produtos."
      />
      <EmConstrucao tabelas={["categorias"]} />
    </>
  )
}

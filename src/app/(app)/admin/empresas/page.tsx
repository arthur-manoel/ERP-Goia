import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Empresas" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Empresas"
        descricao="Empresas cadastradas no sistema."
      />
      <EmConstrucao tabelas={["empresas"]} />
    </>
  )
}

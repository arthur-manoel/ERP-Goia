import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Tipos de produto" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Tipos de produto"
        descricao="Tipos de produto (compartilhados entre empresas)."
      />
      <EmConstrucao tabelas={["tipos_produto"]} />
    </>
  )
}

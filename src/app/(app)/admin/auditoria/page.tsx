import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Auditoria" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Auditoria"
        descricao="Registro das operações feitas no sistema."
      />
      <EmConstrucao tabelas={["auditoria"]} />
    </>
  )
}

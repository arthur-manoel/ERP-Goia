import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Clientes" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Clientes"
        descricao="Cadastro de clientes da empresa."
      />
      <EmConstrucao tabelas={["clientes"]} />
    </>
  )
}

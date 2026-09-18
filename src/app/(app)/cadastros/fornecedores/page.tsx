import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Fornecedores" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Fornecedores"
        descricao="Fornecedores e condições por empresa."
      />
      <EmConstrucao tabelas={["fornecedores", "empresa_fornecedor"]} />
    </>
  )
}

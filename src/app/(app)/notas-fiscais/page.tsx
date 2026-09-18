import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Notas fiscais de entrada" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Notas fiscais de entrada"
        descricao="Recebimento de notas fiscais e entrada no estoque."
      />
      <EmConstrucao tabelas={["nota_fiscal", "item_nota_fiscal"]} />
    </>
  )
}

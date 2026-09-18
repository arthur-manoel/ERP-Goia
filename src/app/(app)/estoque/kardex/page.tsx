import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Kardex" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Kardex"
        descricao="Histórico de saldo de cada produto."
      />
      <EmConstrucao tabelas={["kardex"]} />
    </>
  )
}

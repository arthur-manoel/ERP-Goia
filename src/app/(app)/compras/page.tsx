import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Compras" }

export default function Page() {
  return (
    <>
      <PageHeader titulo="Compras" descricao="Compras e seus itens." />
      <EmConstrucao tabelas={["compras", "compra_itens"]} />
    </>
  )
}

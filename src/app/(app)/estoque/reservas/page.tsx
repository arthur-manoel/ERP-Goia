import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Reservas de estoque" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Reservas de estoque"
        descricao="Reservas para vendas e ordens de produção."
      />
      <EmConstrucao tabelas={["reserva_estoque"]} />
    </>
  )
}

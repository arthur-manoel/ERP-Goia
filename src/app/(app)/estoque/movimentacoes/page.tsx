import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Movimentações de estoque" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Movimentações de estoque"
        descricao="Entradas, saídas, ajustes e transferências."
      />
      <EmConstrucao tabelas={["movimentacao_estoque"]} />
    </>
  )
}

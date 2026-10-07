import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Requisições de compra" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Requisições de compra"
        descricao="Solicitações de compra feitas pelos setores."
      />
      <EmConstrucao tabelas={["requisicao_compra", "item_requisicao_compra"]} />
    </>
  )
}

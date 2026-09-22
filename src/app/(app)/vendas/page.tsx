import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Vendas" }

export default function Page() {
  return (
    <>
      <PageHeader titulo="Vendas" descricao="Pedidos de venda e seus itens." />
      <EmConstrucao tabelas={["venda", "item_venda"]} />
    </>
  )
}

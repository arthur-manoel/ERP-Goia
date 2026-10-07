import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Pedidos de compra" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Pedidos de compra"
        descricao="Pedidos emitidos aos fornecedores."
      />
      <EmConstrucao tabelas={["pedido_compra", "item_pedido_compra"]} />
    </>
  )
}

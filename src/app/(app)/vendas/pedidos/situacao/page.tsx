import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { SituacaoPedidos } from "@/components/vendas/situacao-pedidos"

export const metadata: Metadata = { title: "Situação dos pedidos" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Situação dos pedidos"
        descricao="Acompanhe o pedido do aberto até entregue, com a ordem de produção vinculada quando houver."
      />
      <SituacaoPedidos />
    </>
  )
}

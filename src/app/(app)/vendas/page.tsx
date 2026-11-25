import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { TelaPdv } from "@/features/vendas/components/tela-pdv"

export const metadata: Metadata = { title: "PDV | Vendas" }

export default function Page() {
  return (
    <>
      <PageHeader titulo="PDV" descricao="Ponto de venda e gestão de vendas." />
      <TelaPdv />
    </>
  )
}

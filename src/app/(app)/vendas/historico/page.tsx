import type { Metadata } from "next"
import { TelaHistoricoVendas } from "@/features/historico-vendas/components/tela-historico-vendas"

export const metadata: Metadata = { title: "Histórico de vendas | Vendas" }

export default function Page() {
  return <TelaHistoricoVendas />
}

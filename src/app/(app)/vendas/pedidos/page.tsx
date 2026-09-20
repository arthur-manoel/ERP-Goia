import type { Metadata } from "next"
import { TelaPedidos } from "@/features/pedidos/components/tela-pedidos"
export const metadata: Metadata = { title: "Pedidos de venda" }
export default function Page() {
  return <TelaPedidos />
}

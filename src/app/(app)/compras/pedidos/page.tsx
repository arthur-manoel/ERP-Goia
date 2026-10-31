import type { Metadata } from "next"
import { TelaPedidos } from "@/features/compras/components/tela-pedidos"

export const metadata: Metadata = { title: "Pedidos de compra" }

export default function Page() {
  return <TelaPedidos />
}

import type { Metadata } from "next"
import { TelaCompras } from "@/features/compras/components/tela-compras"

export const metadata: Metadata = { title: "Compras" }

export default function Page() {
  return <TelaCompras />
}

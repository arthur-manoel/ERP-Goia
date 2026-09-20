import type { Metadata } from "next"
import { TelaInsumos } from "@/features/estoque/components/tela-insumos"

export const metadata: Metadata = { title: "Insumos" }

export default function Page() {
  return <TelaInsumos />
}

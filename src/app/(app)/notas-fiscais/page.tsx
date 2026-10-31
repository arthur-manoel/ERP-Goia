import type { Metadata } from "next"
import { TelaNotas } from "@/features/compras/components/tela-notas"

export const metadata: Metadata = { title: "Notas fiscais" }

export default function Page() {
  return <TelaNotas />
}

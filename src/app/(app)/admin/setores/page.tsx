import type { Metadata } from "next"
import { TelaSetores } from "@/features/setores/components/tela-setores"

export const metadata: Metadata = { title: "Setores" }

export default function Page() {
  return <TelaSetores />
}

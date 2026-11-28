import type { Metadata } from "next"
import { TelaLocaisEstoque } from "@/features/locais-estoque/components/tela-locais-estoque"

export const metadata: Metadata = { title: "Locais de estoque" }

export default function Page() {
  return <TelaLocaisEstoque />
}

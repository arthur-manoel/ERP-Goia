import type { Metadata } from "next"
import { TelaMovimentacoes } from "@/features/estoque/components/tela-movimentacoes"

export const metadata: Metadata = { title: "Movimentações de estoque" }

export default function Page() {
  return <TelaMovimentacoes />
}

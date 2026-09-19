import type { Metadata } from "next"
import { TelaEstoque } from "@/features/estoque/components/tela-estoque"
export const metadata: Metadata = { title: "Controle de estoque" }
export default function Page() {
  return <TelaEstoque />
}

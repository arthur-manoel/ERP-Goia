import type { Metadata } from "next"
import { TelaProdutos } from "@/features/produtos/components/tela-produtos"

export const metadata: Metadata = { title: "Produtos" }

export default function Page() {
  return <TelaProdutos />
}

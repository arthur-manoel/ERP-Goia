import type { Metadata } from "next"
import { TelaFornecedores } from "@/features/fornecedores/components/tela-fornecedores"

export const metadata: Metadata = { title: "Fornecedores" }

export default function Page() {
  return <TelaFornecedores />
}

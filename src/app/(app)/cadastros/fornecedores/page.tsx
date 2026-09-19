import type { Metadata } from "next"
import { TelaFornecedores } from "@/features/clientes/components/tela-clientes"
export const metadata: Metadata = { title: "Fornecedores" }
export default function Page() {
  return <TelaFornecedores />
}

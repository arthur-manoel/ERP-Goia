import type { Metadata } from "next"
import { TelaEmpresaFornecedor } from "@/features/empresa-fornecedor/components/tela-empresa-fornecedor"
export const metadata: Metadata = { title: "Condições de fornecedores" }
export default function Page() {
  return <TelaEmpresaFornecedor />
}

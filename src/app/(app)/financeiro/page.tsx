import type { Metadata } from "next"
import { TelaFinanceiro } from "@/features/financeiro/components/tela-financeiro"
export const metadata: Metadata = { title: "Lançamentos financeiros" }
export default function Page() {
  return <TelaFinanceiro />
}

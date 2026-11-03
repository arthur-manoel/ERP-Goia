import type { Metadata } from "next"
import { TelaRecebimentos } from "@/features/recebimentos/components/tela-recebimentos"

export const metadata: Metadata = { title: "Contas a receber" }
export default function Page() {
  return <TelaRecebimentos />
}

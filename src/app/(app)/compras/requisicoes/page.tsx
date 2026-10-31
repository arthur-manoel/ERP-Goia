import type { Metadata } from "next"
import { TelaRequisicoes } from "@/features/compras/components/tela-requisicoes"

export const metadata: Metadata = { title: "Solicitações de compra" }

export default function Page() {
  return <TelaRequisicoes />
}

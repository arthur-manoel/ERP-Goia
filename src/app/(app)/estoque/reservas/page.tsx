import type { Metadata } from "next"
import { OperacoesEstoque } from "@/features/reservas/components/operacoes-estoque"

export const metadata: Metadata = { title: "Reservas de estoque" }

export default function Page() {
  return <OperacoesEstoque />
}

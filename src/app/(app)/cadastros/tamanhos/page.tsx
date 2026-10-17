import type { Metadata } from "next"
import { TelaVariacoes } from "@/features/variacoes/components/tela-variacoes"

export const metadata: Metadata = { title: "Tamanhos" }

export default function Page() {
  return <TelaVariacoes tipo="tamanho" />
}

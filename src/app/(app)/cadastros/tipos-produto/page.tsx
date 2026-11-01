import type { Metadata } from "next"
import { TelaTiposProduto } from "@/features/tipos-produto/components/tela-tipos-produto"

export const metadata: Metadata = { title: "Tipos de produto" }

export default function Page() {
  return <TelaTiposProduto />
}

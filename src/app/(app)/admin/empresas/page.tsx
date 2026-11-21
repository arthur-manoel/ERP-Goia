import type { Metadata } from "next"
import { TelaEmpresas } from "@/features/empresas/components/tela-empresas"

export const metadata: Metadata = { title: "Empresas" }

export default function Page() {
  return <TelaEmpresas />
}

import type { Metadata } from "next"
import { TelaOrdensProducao } from "@/features/producao/components/tela-ordens-producao"
export const metadata: Metadata = { title: "Ordens de produção" }
export default function Page() {
  return <TelaOrdensProducao />
}

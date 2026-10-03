import type { Metadata } from "next"
import { TelaFluxosProducao } from "@/features/fluxo-producao/components/tela-fluxos-producao"

export const metadata: Metadata = { title: "Fluxos de produção" }

export default function Page() {
  return <TelaFluxosProducao />
}

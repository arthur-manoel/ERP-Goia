import type { Metadata } from "next"
import { TelaFichasTecnicas } from "@/features/fichas-tecnicas/components/tela-fichas-tecnicas"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Fichas técnicas" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Fichas técnicas"
        descricao="Composição de insumos por produto fabricado."
      />
      <TelaFichasTecnicas />
    </>
  )
}

import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Setores" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Setores"
        descricao="Setores, tipos de setor e permissões por setor."
      />
      <EmConstrucao tabelas={["setores", "tipos_setor", "permissoes_setor"]} />
    </>
  )
}

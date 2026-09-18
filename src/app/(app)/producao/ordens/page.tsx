import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Ordens de produção" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Ordens de produção"
        descricao="Planejamento e acompanhamento das ordens de produção."
      />
      <EmConstrucao
        tabelas={[
          "ordem_producao",
          "ordem_producao_item",
          "ordem_producao_consumo_planejado",
          "ordem_producao_fluxo_setor",
          "necessidade_producao",
        ]}
      />
    </>
  )
}

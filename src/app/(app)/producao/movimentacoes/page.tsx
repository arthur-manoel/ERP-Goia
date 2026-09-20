import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Movimentação entre setores" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Movimentação entre setores"
        descricao="Envio e recebimento da produção entre setores e consumo de materiais."
      />
      <EmConstrucao
        tabelas={[
          "ordem_producao_movimentacao_setor",
          "ordem_producao_movimentacao_item",
          "consumo_producao",
        ]}
      />
    </>
  )
}

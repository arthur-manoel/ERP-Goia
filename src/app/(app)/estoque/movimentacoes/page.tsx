import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { PainelMovimentacao } from "@/components/movimentacao/painel-movimentacao"

export const metadata: Metadata = { title: "Movimentação" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Movimentação"
        descricao="Posição atual, registro de entradas/saídas/transferências e histórico por período."
      />
      <PainelMovimentacao />
    </>
  )
}

import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import {
  ExportarPosicaoEstoqueButton,
  PosicaoEstoque,
} from "./_components/posicao-estoque"

export const metadata: Metadata = { title: "Relatório de posição de estoque" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Relatório de posição de estoque"
        descricao="Posição atual por insumo e por variação de produto, com histórico de movimentação por período."
        acoes={<ExportarPosicaoEstoqueButton />}
      />
      <PosicaoEstoque />
    </>
  )
}

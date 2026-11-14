import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { TelaRelatorioProducao } from "@/features/relatorio-producao/components/tela-relatorio-producao"

export const metadata: Metadata = { title: "Relatório de produção" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Relatório de produção"
        descricao="Registros de quantidade no encerramento de ordens de produção concluídas."
      />
      <TelaRelatorioProducao />
    </>
  )
}

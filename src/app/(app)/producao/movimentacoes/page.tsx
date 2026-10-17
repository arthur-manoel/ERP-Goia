import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { Apontamento } from "@/components/producao/apontamento"

export const metadata: Metadata = { title: "Apontamento de produção" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Apontamento de produção"
        descricao="Registro do que foi produzido em cada etapa e do que foi perdido, com motivo."
      />
      <Apontamento />
    </>
  )
}

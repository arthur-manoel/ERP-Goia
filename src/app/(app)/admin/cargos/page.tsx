import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Cargos" }

export default function Page() {
  return (
    <>
      <PageHeader titulo="Cargos" descricao="Cargos dos usuários na empresa." />
      <EmConstrucao tabelas={["cargos"]} />
    </>
  )
}

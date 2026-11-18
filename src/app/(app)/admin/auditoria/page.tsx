import type { Metadata } from "next"
import { TelaAuditoria } from "@/features/auditoria/tela-auditoria"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Auditoria" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Auditoria"
        descricao="Registro das operações feitas no sistema."
      />
      <TelaAuditoria />
    </>
  )
}

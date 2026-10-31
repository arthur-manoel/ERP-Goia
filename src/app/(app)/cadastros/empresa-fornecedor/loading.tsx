import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
export default function Loading() {
  return (
    <>
      <PageHeader
        titulo="Condições de fornecedores"
        descricao="Gerencie negociações por empresa."
      />
      <Skeleton
        role="status"
        aria-label="Carregando fornecedores"
        className="h-80 w-full"
      />
    </>
  )
}

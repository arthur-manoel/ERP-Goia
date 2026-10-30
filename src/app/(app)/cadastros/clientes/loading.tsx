import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <>
      <PageHeader
        titulo="Clientes"
        descricao="Cadastre e consulte os clientes da empresa."
      />
      <Skeleton className="h-24 w-full" />
      <Skeleton
        role="status"
        aria-label="Carregando clientes"
        className="h-80 w-full"
      />
    </>
  )
}

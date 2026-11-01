import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <>
      <PageHeader
        titulo="Categorias de produto"
        descricao="Organize os produtos do catálogo da empresa."
      />
      <Skeleton className="h-64 w-full" aria-label="Carregando categorias" />
    </>
  )
}

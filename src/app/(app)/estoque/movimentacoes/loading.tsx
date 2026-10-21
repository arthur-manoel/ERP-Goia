import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <>
      <PageHeader
        titulo="Movimentação"
        descricao="Registre entradas, saídas e transferências de estoque."
      />
      <Card className="max-w-2xl">
        <CardHeader>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Skeleton className="h-8 w-full sm:w-80" />
          <Skeleton className="h-8 w-full" />
          <div className="grid gap-5 sm:grid-cols-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
          <Skeleton className="h-8 w-full sm:w-64" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    </>
  )
}

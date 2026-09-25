import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div role="status" aria-label="Carregando estoque" className="space-y-6">
      <Skeleton className="h-10 w-64 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, indice) => (
          <Skeleton key={indice} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-80 w-full" />
    </div>
  )
}

import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Carregando produtos">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="space-y-3 rounded-xl border p-3">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 6 }, (_, indice) => (
          <Skeleton key={indice} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}

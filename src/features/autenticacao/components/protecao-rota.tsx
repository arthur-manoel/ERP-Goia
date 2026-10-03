"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { useAutenticacao } from "../provedor-autenticacao"

export function ProtecaoRota({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { estado } = useAutenticacao()

  useEffect(() => {
    if (estado === "anonimo") {
      router.replace(`/login?retorno=${encodeURIComponent(pathname)}`)
    }
  }, [estado, pathname, router])

  if (estado !== "autenticado") {
    return (
      <div
        className="flex min-h-svh items-center justify-center p-4"
        role="status"
        aria-label="Verificando autenticação"
      >
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-36 w-full" />
        </div>
      </div>
    )
  }

  return <>{children}</>
}

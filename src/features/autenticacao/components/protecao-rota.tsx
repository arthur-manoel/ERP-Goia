"use client"
import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { useAutenticacao } from "../provedor-autenticacao"
import { SeletorEmpresa } from "./seletor-empresa"

export function ProtecaoRota({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { estado, empresa, empresas, erroAcesso, recarregarAcesso, sair } =
    useAutenticacao()
  useEffect(() => {
    if (estado === "anonimo")
      router.replace(`/login?retorno=${encodeURIComponent(pathname)}`)
  }, [estado, pathname, router])
  if (estado === "carregando" || estado === "anonimo")
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
  if (estado === "erro" || !empresa)
    return (
      <main className="flex min-h-svh items-center justify-center p-4">
        <div className="w-full max-w-md space-y-5 rounded-xl border bg-card p-6">
          <h1 className="text-xl font-semibold">
            {estado === "erro"
              ? "Não foi possível carregar as empresas"
              : empresas.length
                ? "Selecione uma empresa"
                : "Nenhuma empresa disponível"}
          </h1>
          <p
            className="text-sm text-muted-foreground"
            role={estado === "erro" ? "alert" : "status"}
          >
            {erroAcesso ??
              (empresas.length
                ? "Escolha a empresa em que deseja trabalhar para continuar."
                : "Sua conta não possui vínculos ativos com empresas ativas. Solicite ao responsável a conferência do seu vínculo.")}
          </p>
          {estado !== "erro" && <SeletorEmpresa />}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void recarregarAcesso()}>
              Tentar novamente
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                void sair().catch(() =>
                  toast.error(
                    "A sessão local foi encerrada, mas não foi possível confirmar o logout no servidor. Tente novamente antes de sair deste navegador.",
                  ),
                )
              }
            >
              Sair
            </Button>
          </div>
        </div>
      </main>
    )
  return <>{children}</>
}

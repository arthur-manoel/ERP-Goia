"use client"
import { Fragment, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { useAutenticacao } from "../provedor-autenticacao"
import { SeletorEmpresa } from "./seletor-empresa"

export function ProtecaoRota({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const {
    estado,
    empresa,
    empresas,
    erroAcesso,
    recarregarAcesso,
    sair,
    sessaoIdentificada,
    saindo,
    erroSaida,
  } = useAutenticacao()
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
            {erroSaida
              ? "Saída sem confirmação. Tente sair novamente."
              : (erroAcesso ??
                (empresas.length
                  ? "Escolha a empresa em que deseja trabalhar para continuar."
                  : "Sua conta não possui vínculos ativos com empresas ativas. Solicite ao responsável a conferência do seu vínculo."))}
          </p>
          {estado !== "erro" && <SeletorEmpresa />}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={saindo || erroSaida}
              onClick={() => void recarregarAcesso()}
            >
              Tentar novamente
            </Button>
            {sessaoIdentificada && (
              <Button
                variant="ghost"
                disabled={saindo}
                onClick={() =>
                  void sair().catch(() =>
                    toast.error(
                      "Não foi possível confirmar o encerramento da sessão. Tente sair novamente.",
                    ),
                  )
                }
              >
                {saindo ? "Saindo…" : "Sair"}
              </Button>
            )}
          </div>
        </div>
      </main>
    )
  return <>{children}</>
}

export function ConteudoDaEmpresa({ children }: { children: React.ReactNode }) {
  const { chaveEmpresa } = useAutenticacao()
  return <Fragment key={chaveEmpresa}>{children}</Fragment>
}

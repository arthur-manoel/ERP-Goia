import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { ErpProvider } from "@/features/erp/components/provedor"
import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { obterUsuarioAtual } from "@/features/autenticacao/usuario-atual"

// Ler cookies torna todas as telas do app dinâmicas (renderizadas por requisição).
// Assim nenhuma consulta ao banco roda durante o build.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const usuario = await obterUsuarioAtual()
  const sidebarAberta = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <ErpProvider>
      <SidebarProvider defaultOpen={sidebarAberta}>
        <AppSidebar />
        <SidebarInset>
          <AppHeader usuario={usuario} />
          <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ErpProvider>
  )
}

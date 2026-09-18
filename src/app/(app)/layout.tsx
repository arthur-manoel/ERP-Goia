import { cookies } from "next/headers"
import { AppHeader } from "@/components/layout/app-header"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

// Ler cookies torna todas as telas do app dinâmicas (renderizadas por requisição).
// Assim nenhuma consulta ao banco roda durante o build.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies()
  const sidebarAberta = cookieStore.get("sidebar_state")?.value !== "false"

  return (
    <SidebarProvider defaultOpen={sidebarAberta}>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

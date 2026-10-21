import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeToggle } from "./theme-toggle"
import { MenuUsuario } from "@/features/autenticacao/components/menu-usuario"
import type { UsuarioLogado } from "@/features/autenticacao/types"

export function AppHeader({ usuario }: { usuario: UsuarioLogado | null }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="my-4" />
      <div className="ml-auto flex items-center gap-2">
        <ThemeToggle />
        <MenuUsuario usuario={usuario} />
      </div>
    </header>
  )
}

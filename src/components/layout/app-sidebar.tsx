"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Factory } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { navegacao } from "@/config/navegacao"

const hrefs = navegacao.flatMap((grupo) => grupo.itens.map((item) => item.href))

// O item ativo é o de prefixo mais longo: em /compras/pedidos, "Pedidos de compra"
// fica ativo e "Compras" (/compras) não.
function hrefAtivo(pathname: string) {
  return hrefs
    .filter(
      (href) =>
        pathname === href || (href !== "/" && pathname.startsWith(`${href}/`)),
    )
    .sort((a, b) => b.length - a.length)[0]
}

export function AppSidebar() {
  const ativo = hrefAtivo(usePathname())
  // No celular a sidebar é um painel sobreposto: fecha ao escolher uma tela.
  const { setOpenMobile } = useSidebar()
  const fecharNoCelular = () => setOpenMobile(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={fecharNoCelular}
              render={<Link href="/" />}
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Factory className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">ERP Goia</span>
                <span className="truncate text-xs text-muted-foreground">
                  Gestão industrial
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {navegacao.map((grupo) => (
          <SidebarGroup key={grupo.titulo}>
            <SidebarGroupLabel>{grupo.titulo}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {grupo.itens.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={item.href === ativo}
                      tooltip={item.titulo}
                      onClick={fecharNoCelular}
                      render={<Link href={item.href} />}
                    >
                      <item.icone />
                      <span>{item.titulo}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

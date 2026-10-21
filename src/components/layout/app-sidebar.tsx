"use client"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, Factory } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
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
  const { setOpenMobile, state } = useSidebar()
  const [gruposAbertos, setGruposAbertos] = useState<Record<string, boolean>>(
    {},
  )
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
          <Collapsible
            key={grupo.titulo}
            open={
              state === "collapsed" ||
              (gruposAbertos[grupo.titulo] ??
                (grupo.titulo === "Geral" ||
                  grupo.itens.some((item) => item.href === ativo)))
            }
            onOpenChange={(open) =>
              setGruposAbertos((previous) => ({
                ...previous,
                [grupo.titulo]: open,
              }))
            }
          >
            <SidebarGroup>
              <CollapsibleTrigger className="group flex w-full items-center justify-between rounded-md px-2 py-2 text-xs font-medium text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring">
                <span>{grupo.titulo}</span>
                <ChevronDown className="size-4 transition-transform group-aria-expanded:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
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
              </CollapsibleContent>
            </SidebarGroup>
          </Collapsible>
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}

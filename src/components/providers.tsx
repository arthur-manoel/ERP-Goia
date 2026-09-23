"use client"

import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { ProvedorAutenticacao } from "@/features/autenticacao/provedor-autenticacao"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <TooltipProvider>
        <ProvedorAutenticacao>{children}</ProvedorAutenticacao>
        <Toaster richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  )
}

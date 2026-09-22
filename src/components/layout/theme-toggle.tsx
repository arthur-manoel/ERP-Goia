"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Alternar tema"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      {/* Os ícones trocam via CSS para não depender do tema durante a hidratação. */}
      <Sun className="dark:hidden" />
      <Moon className="hidden dark:block" />
    </Button>
  )
}

import type { Metadata } from "next"
import { TelaCategorias } from "@/features/categorias/components/tela-categorias"

export const metadata: Metadata = { title: "Categorias de produto" }

export default function Page() {
  return <TelaCategorias />
}

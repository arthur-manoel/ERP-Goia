import type { Metadata } from "next"
import { TelaUsuarios } from "@/features/usuarios/components/tela-usuarios"

export const metadata: Metadata = { title: "Usuários" }

export default function Page() {
  return <TelaUsuarios />
}

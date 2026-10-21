import type { Metadata } from "next"
import { TelaClientes } from "@/features/clientes/components/tela-clientes"
export const metadata: Metadata = { title: "Clientes" }
export default function Page() {
  return <TelaClientes />
}

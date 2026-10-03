import type { Metadata } from "next"
import { CardLogin } from "@/features/autenticacao/components/card-login"

export const metadata: Metadata = { title: "Entrar" }

export default function LoginPage() {
  return <CardLogin />
}

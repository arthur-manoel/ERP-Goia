import type { Metadata } from "next"
import { CardLogin } from "@/features/autenticacao/components/card-login"
import { retornoSeguro } from "@/features/autenticacao/retorno"

export const metadata: Metadata = { title: "Entrar" }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ retorno?: string | string[] }>
}) {
  const retorno = retornoSeguro((await searchParams).retorno)
  return <CardLogin retorno={retorno} />
}

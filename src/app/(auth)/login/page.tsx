import type { Metadata } from "next"
import { CardLogin } from "@/features/autenticacao/components/card-login"

export const metadata: Metadata = { title: "Entrar" }

function retornoSeguro(valor: string | string[] | undefined) {
  const retorno = Array.isArray(valor) ? valor[0] : valor
  if (
    !retorno?.startsWith("/") ||
    retorno.startsWith("//") ||
    retorno.startsWith("/login")
  ) {
    return "/"
  }
  return retorno
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ retorno?: string | string[] }>
}) {
  const retorno = retornoSeguro((await searchParams).retorno)
  return <CardLogin retorno={retorno} />
}

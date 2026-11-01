import type { Metadata } from "next"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EmConstrucao } from "@/components/layout/em-construcao"

export const metadata: Metadata = { title: "Entrar" }

export default function LoginPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>ERP Goia</CardTitle>
        <CardDescription>Entre com seu e-mail e senha.</CardDescription>
      </CardHeader>
      <CardContent>
        <EmConstrucao tabelas={["usuarios", "refresh_tokens"]} />
      </CardContent>
    </Card>
  )
}

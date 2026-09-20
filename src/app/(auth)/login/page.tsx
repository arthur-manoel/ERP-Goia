import type { Metadata } from "next"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { FormularioLogin } from "@/features/autenticacao/components/formulario-login"
import { PageHeader } from "@/components/layout/page-header"
import { Factory } from "lucide-react"

export const metadata: Metadata = { title: "Entrar" }

export default function LoginPage() {
  return (
    <div className="space-y-7">
      <div className="flex items-center justify-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Factory className="size-5" />
        </span>
        <div>
          <p className="font-semibold">ERP Goia</p>
          <p className="text-xs text-muted-foreground">Gestão industrial</p>
        </div>
      </div>
      <Card className="gap-6 py-6 shadow-sm">
        <CardHeader>
          <PageHeader
            titulo="Acesse sua empresa"
            descricao="Entre com o usuário e a senha fornecidos pela sua empresa."
          />
        </CardHeader>
        <CardContent>
          <FormularioLogin />
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Estoque · Produção · Pedidos · Financeiro
      </p>
    </div>
  )
}

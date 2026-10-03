import { Factory } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { FormularioLogin } from "./formulario-login"

export function CardLogin() {
  return (
    <div className="w-full max-w-md space-y-7">
      <div
        className="flex items-center justify-center gap-3"
        aria-label="ERP Goia"
      >
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Factory className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-semibold">ERP Goia</p>
          <p className="text-xs text-muted-foreground">Gestão industrial</p>
        </div>
      </div>

      <Card className="gap-6 py-6 shadow-sm">
        <CardHeader>
          <CardTitle>Acesse sua empresa</CardTitle>
          <CardDescription>
            Entre com suas credenciais para acessar o painel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioLogin />
        </CardContent>
      </Card>

      <Alert>
        <AlertDescription className="text-center text-xs leading-relaxed">
          Esqueceu sua senha ou precisa de acesso? Entre em contato com o
          administrador da sua empresa.
        </AlertDescription>
      </Alert>
    </div>
  )
}

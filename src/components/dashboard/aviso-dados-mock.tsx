import { FlaskConical } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

/** Aparece sempre que a Dashboard estiver usando dados fictícios (só em desenvolvimento). */
export function AvisoDadosMock() {
  return (
    <Alert>
      <FlaskConical aria-hidden />
      <AlertTitle>Dados de demonstração</AlertTitle>
      <AlertDescription>
        Os números abaixo são fictícios. Para usar dados reais, remova
        DASHBOARD_DADOS_MOCK do .env.local.
      </AlertDescription>
    </Alert>
  )
}

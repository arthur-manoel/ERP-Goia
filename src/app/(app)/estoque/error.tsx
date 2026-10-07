"use client"

import { CircleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

export default function Error({ reset }: { reset: () => void }) {
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertTitle>Não foi possível carregar o estoque</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>Verifique seu acesso à empresa e tente novamente.</p>
        <Button type="button" variant="outline" onClick={reset}>
          Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  )
}

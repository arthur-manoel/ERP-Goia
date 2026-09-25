"use client"

import { TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

type ErrorProps = {
  reset: () => void
}

export default function Error({ reset }: ErrorProps) {
  return (
    <Alert variant="destructive">
      <TriangleAlert />
      <AlertTitle>Não foi possível carregar os produtos.</AlertTitle>
      <AlertDescription>
        Tente novamente. Se o problema persistir, entre em contato com o
        responsável pelo sistema.
      </AlertDescription>
      <Button variant="outline" onClick={reset}>
        Tentar novamente
      </Button>
    </Alert>
  )
}

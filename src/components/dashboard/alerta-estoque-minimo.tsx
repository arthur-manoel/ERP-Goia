"use client"

import Link from "next/link"
import { CircleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { textoResumoEstoque } from "@/lib/dashboard/estoque"
import { useIndicadorEstoque } from "./provedor-indicador-estoque"

export function AlertaEstoqueMinimo() {
  const { estado, empresa, dados } = useIndicadorEstoque()
  if (estado !== "autenticado" || !empresa || !dados) return null

  const texto = textoResumoEstoque(dados)
  if (!texto) return null

  return (
    <Alert variant="destructive">
      <CircleAlert aria-hidden />
      <AlertTitle>Estoque precisa de atenção</AlertTitle>
      <AlertDescription>
        <Link
          href="/estoque"
          className="font-medium underline underline-offset-4 hover:no-underline"
        >
          {texto}
        </Link>
      </AlertDescription>
    </Alert>
  )
}

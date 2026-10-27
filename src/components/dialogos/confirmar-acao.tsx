"use client"

import type { ReactNode } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type Props = {
  aberto: boolean
  titulo: string
  descricao: ReactNode
  rotuloConfirmar: string
  /** Texto do botão enquanto `ocupado` (ex.: "Inativando…"). */
  rotuloOcupado?: string
  rotuloCancelar?: string
  destrutivo?: boolean
  /** Enquanto verdadeiro, bloqueia novo clique e o fechamento do diálogo. */
  ocupado?: boolean
  onConfirmar: () => void
  onFechar: () => void
}

/**
 * Confirmação de ação (principalmente destrutiva). Quem chama controla o
 * estado `ocupado` e o tratamento do resultado; o componente só garante que
 * um clique repetido ou o fechamento não interrompam a operação em curso.
 */
export function ConfirmarAcao({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar,
  rotuloOcupado,
  rotuloCancelar = "Cancelar",
  destrutivo,
  ocupado = false,
  onConfirmar,
  onFechar,
}: Props) {
  return (
    <AlertDialog
      open={aberto}
      onOpenChange={(abrir) => {
        if (!abrir && !ocupado) onFechar()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={ocupado}>
            {rotuloCancelar}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destrutivo ? "destructive" : "default"}
            disabled={ocupado}
            onClick={onConfirmar}
          >
            {ocupado && rotuloOcupado ? rotuloOcupado : rotuloConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

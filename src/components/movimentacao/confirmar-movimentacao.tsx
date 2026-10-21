"use client"

import { TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Spinner } from "@/components/ui/spinner"
import {
  rotuloTipo,
  type ResumoMovimentacaoDados,
} from "@/lib/movimentacao/tipos"
import { ResumoMovimentacao } from "./resumo-movimentacao"

type ConfirmarMovimentacaoProps = {
  resumo: ResumoMovimentacaoDados | null
  aberto: boolean
  enviando: boolean
  erro: string | null
  onConfirmar: () => void
  onVoltar: () => void
}

export function ConfirmarMovimentacao({
  resumo,
  aberto,
  enviando,
  erro,
  onConfirmar,
  onVoltar,
}: ConfirmarMovimentacaoProps) {
  if (!resumo) return null
  const operacao = rotuloTipo[resumo.tipo].toLowerCase()

  return (
    <AlertDialog
      open={aberto}
      // Enquanto envia, fechar (Esc ou clique fora) é ignorado.
      onOpenChange={(abrir) => {
        if (!abrir && !enviando) onVoltar()
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Conferir {operacao}</AlertDialogTitle>
          <AlertDialogDescription>
            Revise os dados antes de confirmar.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ResumoMovimentacao resumo={resumo} />

        {erro && (
          <Alert variant="destructive">
            <TriangleAlert aria-hidden />
            <AlertTitle>Não foi possível concluir</AlertTitle>
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>
            Voltar e editar
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmar} disabled={enviando}>
            {enviando && <Spinner data-icon="inline-start" />}
            {enviando ? "Preparando…" : `Confirmar ${operacao}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

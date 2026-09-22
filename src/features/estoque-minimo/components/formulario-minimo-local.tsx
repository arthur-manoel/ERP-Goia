"use client"

import { useActionState, useEffect } from "react"
import { toast } from "sonner"
import { configurarMinimoLocal } from "../actions"
import type { PosicaoEstoque } from "../tipos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { estadoInicial } from "@/lib/formulario"
import { formatarQuantidade } from "@/lib/formatacao"

export function FormularioMinimoLocal({
  posicao,
  onClose,
}: {
  posicao: PosicaoEstoque
  onClose: () => void
}) {
  const [estado, acao, pendente] = useActionState(
    configurarMinimoLocal,
    estadoInicial,
  )

  useEffect(() => {
    if (!estado.ok) return
    toast.success(estado.mensagem)
    onClose()
  }, [estado, onClose])

  const erro = estado.erros?.quantidadeMinima?.[0]
  const erroServidor = estado.erros?.servidor?.[0]

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !pendente) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estoque mínimo por local</DialogTitle>
          <DialogDescription>
            Configure o limite de {posicao.produto} exclusivamente para o local
            {` ${posicao.local}`}.
          </DialogDescription>
        </DialogHeader>
        <form action={acao} className="space-y-5">
          <input type="hidden" name="idProduto" value={posicao.idProduto} />
          <input
            type="hidden"
            name="idLocalEstoque"
            value={posicao.idLocalEstoque}
          />
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{posicao.produto}</p>
            <p className="text-muted-foreground">
              {posicao.tipo} · {posicao.local}
            </p>
            <p className="mt-2 tabular-nums">
              Saldo físico: {formatarQuantidade(posicao.quantidade)}{" "}
              {posicao.unidade}
            </p>
          </div>
          <Field data-invalid={!!erro}>
            <FieldLabel htmlFor="quantidade-minima">
              Quantidade mínima ({posicao.unidade})
            </FieldLabel>
            <Input
              id="quantidade-minima"
              name="quantidadeMinima"
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              defaultValue={posicao.minimo ?? ""}
              aria-invalid={!!erro}
              aria-describedby={erro ? "quantidade-minima-erro" : undefined}
              disabled={pendente}
              required
            />
            {erro && (
              <FieldError id="quantidade-minima-erro">{erro}</FieldError>
            )}
          </Field>
          {erroServidor && (
            <Alert variant="destructive">
              <AlertDescription>{erroServidor}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pendente}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar mínimo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

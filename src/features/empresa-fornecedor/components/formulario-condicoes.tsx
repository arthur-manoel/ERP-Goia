"use client"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { formDays, save, type Row, type Requisitar } from "../api"
export function FormularioCondicoes({
  row,
  editing,
  requisitar,
  onClose,
  onSaved,
}: {
  row: Row
  editing: boolean
  requisitar: Requisitar
  onClose: () => void
  onSaved: () => void
}) {
  const previous = row.associacao
  const [pagamento, setPagamento] = useState(
    previous?.prazo_pagamento?.toString() ?? "",
  )
  const [entrega, setEntrega] = useState(
    previous?.prazo_entrega?.toString() ?? "",
  )
  const [observacao, setObservacao] = useState(previous?.observacao ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    try {
      const conditions = {
        prazo_pagamento: formDays(pagamento),
        prazo_entrega: formDays(entrega),
        observacao: observacao.trim() || null,
      }
      setBusy(true)
      setError("")
      const changes = editing
        ? Object.fromEntries(
            Object.entries(conditions).filter(
              ([key, value]) =>
                value !== previous?.[key as keyof typeof conditions],
            ),
          )
        : conditions
      if (editing && !Object.keys(changes).length) {
        onClose()
        return
      }
      await save(requisitar, row, changes, editing)
      toast.success(
        editing
          ? "Condições comerciais atualizadas."
          : previous
            ? "Fornecedor reativado."
            : "Fornecedor associado.",
      )
      onSaved()
      onClose()
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing
              ? "Editar condições comerciais"
              : previous
                ? "Reativar fornecedor"
                : "Associar fornecedor global"}
          </DialogTitle>
          <DialogDescription>
            {row.fornecedor.razao_social} — condições exclusivas da empresa
            ativa.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field>
            <FieldLabel htmlFor="prazo-pagamento">
              Prazo de pagamento (dias)
            </FieldLabel>
            <Input
              id="prazo-pagamento"
              type="number"
              min={0}
              step={1}
              value={pagamento}
              onChange={(e) => setPagamento(e.target.value)}
              disabled={busy}
            />
            <p className="text-xs text-muted-foreground">
              Vazio: não informado. Zero: pagamento imediato. Não gera parcelas.
            </p>
          </Field>
          <Field>
            <FieldLabel htmlFor="prazo-entrega">
              Prazo de entrega (dias)
            </FieldLabel>
            <Input
              id="prazo-entrega"
              type="number"
              min={0}
              step={1}
              value={entrega}
              onChange={(e) => setEntrega(e.target.value)}
              disabled={busy}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="observacao-comercial">
              Observações comerciais
            </FieldLabel>
            <Textarea
              id="observacao-comercial"
              maxLength={255}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={busy}
            />
          </Field>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy
                ? "Salvando…"
                : editing
                  ? "Salvar condições"
                  : previous
                    ? "Reativar associação"
                    : "Associar fornecedor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"
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
import { formatarQuantidade } from "@/lib/formatacao"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { configurarMinimoSchema } from "@/modules/estoque-minimo/estoque-minimo.schema"

export function FormularioMinimoLocal({
  posicao,
  onClose,
  onSaved,
}: {
  posicao: PosicaoEstoque
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { requisitar } = useAutenticacao()
  const [quantidade, setQuantidade] = useState(posicao.minimo ?? "")
  const [erro, setErro] = useState("")
  const [pendente, setPendente] = useState(false)

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErro("")
    const dados = configurarMinimoSchema.safeParse({
      idProduto: posicao.idProduto,
      idLocalEstoque: posicao.idLocalEstoque,
      quantidadeMinima: quantidade.trim().replace(",", "."),
    })
    if (!dados.success) {
      setErro(dados.error.issues[0]?.message ?? "Quantidade inválida.")
      return
    }
    setPendente(true)
    try {
      const response = await requisitar("/api/estoque-minimo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados.data),
      })
      if (!response.ok) throw new Error(await mensagemErro(response))
      await onSaved()
      toast.success("Estoque mínimo atualizado para este local.")
      onClose()
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao salvar.")
    } finally {
      setPendente(false)
    }
  }

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
        <form onSubmit={salvar} className="space-y-5">
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
              type="number"
              min="0"
              step="0.001"
              inputMode="decimal"
              value={quantidade}
              onChange={(evento) => setQuantidade(evento.target.value)}
              aria-invalid={!!erro}
              aria-describedby={erro ? "quantidade-minima-erro" : undefined}
              disabled={pendente}
              required
            />
            {erro && (
              <FieldError id="quantidade-minima-erro">{erro}</FieldError>
            )}
          </Field>
          {erro && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{erro}</AlertDescription>
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

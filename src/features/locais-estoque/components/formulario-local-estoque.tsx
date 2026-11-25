"use client"

import { useState, type FormEvent } from "react"
import { toast } from "sonner"
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
import { Textarea } from "@/components/ui/textarea"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import {
  formularioVazio,
  paraFormulario,
  paraPatch,
  paraPayload,
} from "../regras"
import { createLocalSchema, patchLocalSchema } from "../schemas"
import type { FormularioLocal, LocalEstoque } from "../tipos"

const endpoint = "/api/locais_estoque"

export function FormularioLocalEstoque({
  local,
  onClose,
  onSaved,
}: {
  /** Registro em edição; `null` cadastra um novo local. */
  local: LocalEstoque | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { requisitar } = useAutenticacao()
  const [formulario, setFormulario] = useState<FormularioLocal>(
    local ? paraFormulario(local) : formularioVazio,
  )
  const [erro, setErro] = useState("")
  const [salvando, setSalvando] = useState(false)

  function alterar(campo: keyof FormularioLocal, valor: string) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }))
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErro("")

    // Na edição vai só o que mudou; na criação, o corpo completo.
    const payload = local
      ? paraPatch(formulario, local)
      : paraPayload(formulario)
    if (local && Object.keys(payload).length === 0) {
      setErro("Nenhuma alteração para salvar.")
      return
    }
    // Mesmas regras da API (modules/locais_estoque/schema.ts).
    const dados = local
      ? patchLocalSchema.safeParse(payload)
      : createLocalSchema.safeParse(payload)
    if (!dados.success) {
      setErro(dados.error.issues[0]?.message ?? "Dados inválidos.")
      return
    }

    setSalvando(true)
    try {
      const resposta = await requisitar(
        local ? `${endpoint}/${local.id}` : endpoint,
        {
          method: local ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      )
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      await onSaved()
      toast.success(
        local ? "Local de estoque atualizado." : "Local de estoque cadastrado.",
      )
      onClose()
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Falha ao salvar.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {local ? "Editar local de estoque" : "Novo local de estoque"}
          </DialogTitle>
          <DialogDescription>
            {local
              ? `Atualize os dados de ${local.nome}.`
              : "Cadastre uma loja, um depósito ou outro local onde o estoque fica guardado."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} noValidate className="space-y-5">
          <Field data-invalid={!!erro}>
            <FieldLabel htmlFor="local-nome">Nome *</FieldLabel>
            <Input
              id="local-nome"
              placeholder="Ex.: Depósito central"
              value={formulario.nome}
              onChange={(e) => alterar("nome", e.target.value)}
              maxLength={100}
              autoFocus
              disabled={salvando}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="local-descricao">
              Descrição (opcional)
            </FieldLabel>
            <Textarea
              id="local-descricao"
              placeholder="Ex.: Galpão dos fundos, onde ficam os tecidos."
              rows={3}
              value={formulario.descricao}
              onChange={(e) => alterar("descricao", e.target.value)}
              maxLength={255}
              disabled={salvando}
            />
          </Field>

          {erro && <FieldError role="alert">{erro}</FieldError>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

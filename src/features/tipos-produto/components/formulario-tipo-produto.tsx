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
import { formularioVazio, paraFormulario, paraPayload } from "../regras"
import { createTipoProdutoSchema, updateTipoProdutoSchema } from "../schemas"
import type { FormularioTipoProduto, TipoProduto } from "../tipos"

const endpoint = "/api/tipos_produto"

export function FormularioTipoProduto({
  tipo,
  onClose,
  onSaved,
}: {
  /** Registro em edição; `null` cadastra um novo tipo. */
  tipo: TipoProduto | null
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { requisitar } = useAutenticacao()
  const [formulario, setFormulario] = useState<FormularioTipoProduto>(
    tipo ? paraFormulario(tipo) : formularioVazio,
  )
  const [erro, setErro] = useState("")
  const [salvando, setSalvando] = useState(false)

  function alterar(campo: keyof FormularioTipoProduto, valor: string) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }))
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErro("")

    // Mesmas regras da API (modules/tipos_produto/schema.ts).
    const payload = paraPayload(formulario)
    const dados = tipo
      ? updateTipoProdutoSchema.safeParse(payload)
      : createTipoProdutoSchema.safeParse(payload)
    if (!dados.success) {
      setErro(dados.error.issues[0]?.message ?? "Dados inválidos.")
      return
    }

    setSalvando(true)
    try {
      const resposta = await requisitar(
        tipo ? `${endpoint}/${tipo.id}` : endpoint,
        {
          method: tipo ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dados.data),
        },
      )
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      await onSaved()
      toast.success(
        tipo ? "Tipo de produto atualizado." : "Tipo de produto cadastrado.",
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
            {tipo ? "Editar tipo de produto" : "Novo tipo de produto"}
          </DialogTitle>
          <DialogDescription>
            {tipo
              ? `Atualize os dados de ${tipo.nome}.`
              : "Informe os dados para cadastrar um novo tipo de produto."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-5">
          <Field data-invalid={!!erro}>
            <FieldLabel htmlFor="tipo-produto-nome">Nome *</FieldLabel>
            <Input
              id="tipo-produto-nome"
              placeholder="Ex.: Produto acabado"
              value={formulario.nome}
              onChange={(e) => alterar("nome", e.target.value)}
              maxLength={100}
              autoFocus
              disabled={salvando}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="tipo-produto-descricao">
              Descrição (opcional)
            </FieldLabel>
            <Textarea
              id="tipo-produto-descricao"
              placeholder="Ex.: Itens prontos para venda ao cliente."
              rows={4}
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

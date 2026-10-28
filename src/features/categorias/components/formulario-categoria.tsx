"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
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
import { Textarea } from "@/components/ui/textarea"
import type { Categoria, DadosCategoria } from "../tipos"

const schema = z.object({
  nome: z
    .string()
    .trim()
    .transform((valor) => valor.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(2, "Informe pelo menos 2 caracteres.")
        .max(100, "Use até 100 caracteres."),
    ),
  descricao: z
    .string()
    .trim()
    .max(255, "Use até 255 caracteres.")
    .transform((valor) => valor || null),
})

type Entrada = z.input<typeof schema>

type Props = {
  categoria?: Categoria
  empresaNome: string
  onClose: () => void
  returnFocus: () => void
  onSalvar: (dados: DadosCategoria, categoria?: Categoria) => Promise<void>
}

export function FormularioCategoria({
  categoria,
  empresaNome,
  onClose,
  returnFocus,
  onSalvar,
}: Props) {
  const form = useForm<Entrada, unknown, DadosCategoria>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: categoria?.nome ?? "",
      descricao: categoria?.descricao ?? "",
    },
  })
  const pendente = form.formState.isSubmitting

  async function salvar(dados: DadosCategoria) {
    try {
      await onSalvar(dados, categoria)
      onClose()
    } catch (causa) {
      form.setError("root.server", {
        message:
          causa instanceof Error
            ? causa.message
            : "Não foi possível salvar a categoria.",
      })
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !pendente) onClose()
      }}
    >
      <DialogContent
        className="sm:max-w-lg"
        finalFocus={() => {
          returnFocus()
          return false
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {categoria ? "Editar categoria" : "Nova categoria"}
          </DialogTitle>
          <DialogDescription>
            Categoria de produto para {empresaNome}.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={form.handleSubmit(salvar)}
          className="space-y-5"
        >
          <fieldset disabled={pendente} className="space-y-5">
            <Field data-invalid={!!form.formState.errors.nome}>
              <FieldLabel htmlFor="categoria-nome">Nome *</FieldLabel>
              <Input
                id="categoria-nome"
                autoFocus
                maxLength={100}
                placeholder="Ex.: Camisetas"
                aria-invalid={!!form.formState.errors.nome}
                aria-describedby={
                  form.formState.errors.nome ? "categoria-nome-erro" : undefined
                }
                {...form.register("nome")}
              />
              {form.formState.errors.nome && (
                <FieldError id="categoria-nome-erro">
                  {form.formState.errors.nome.message}
                </FieldError>
              )}
            </Field>
            <Field data-invalid={!!form.formState.errors.descricao}>
              <FieldLabel htmlFor="categoria-descricao">
                Descrição (opcional)
              </FieldLabel>
              <Textarea
                id="categoria-descricao"
                maxLength={255}
                rows={4}
                placeholder="Descreva os produtos desta categoria."
                aria-invalid={!!form.formState.errors.descricao}
                aria-describedby={
                  form.formState.errors.descricao
                    ? "categoria-descricao-erro"
                    : undefined
                }
                {...form.register("descricao")}
              />
              {form.formState.errors.descricao && (
                <FieldError id="categoria-descricao-erro">
                  {form.formState.errors.descricao.message}
                </FieldError>
              )}
            </Field>
            {form.formState.errors.root?.server && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>
                  {form.formState.errors.root.server.message}
                </AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente}>
                {pendente
                  ? "Salvando…"
                  : categoria
                    ? "Salvar alterações"
                    : "Cadastrar categoria"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}

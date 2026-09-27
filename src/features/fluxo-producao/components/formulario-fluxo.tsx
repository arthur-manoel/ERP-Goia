"use client"

import { useState } from "react"
import { z } from "zod"
import { useFieldArray, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyTitle } from "@/components/ui/empty"
import { useErp } from "@/features/erp/components/provedor"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import type { Setor } from "@/features/setores/schemas"
import { fluxoProducaoSchema, type FluxoProducao } from "../schemas"

// O schema tem `.transform()` na descrição, então entrada e saída têm tipos
// levemente diferentes (ver mesmo comentário em formulario-setor.tsx).
type ValoresFormulario = z.input<typeof fluxoProducaoSchema>
type ValoresSalvas = z.output<typeof fluxoProducaoSchema>

export function FormularioFluxo({
  initial,
  setoresDisponiveis,
  onClose,
  returnFocus,
}: {
  initial?: FluxoProducao
  /** Todos os setores da empresa (ativos e inativos), para exibir corretamente etapas já existentes. */
  setoresDisponiveis: Setor[]
  onClose: () => void
  returnFocus: () => void
}) {
  const { save } = useErp()
  const [setorParaAdicionar, setSetorParaAdicionar] = useState("")
  const form = useForm<ValoresFormulario, unknown, ValoresSalvas>({
    resolver: zodResolver(fluxoProducaoSchema),
    defaultValues: {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      status: initial?.status ?? "Ativo",
      steps: initial?.steps ?? [],
    },
  })
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "steps",
  })
  const pendente = form.formState.isSubmitting

  const idsSelecionados = new Set(fields.map((field) => field.sectorId))
  const setoresPorId = new Map(
    setoresDisponiveis.map((setor) => [setor.id, setor]),
  )
  const opcoesDisponiveis = setoresDisponiveis
    .filter(
      (setor) => setor.status === "Ativo" && !idsSelecionados.has(setor.id),
    )
    .map((setor) => ({ value: setor.id, label: setor.name }))

  function adicionarEtapa() {
    if (!setorParaAdicionar) return
    append({ sectorId: setorParaAdicionar })
    setSetorParaAdicionar("")
    form.clearErrors("steps")
  }

  async function salvar(valores: ValoresSalvas) {
    try {
      await save("productionFlows", valores, initial?.id)
      toast.success(
        initial
          ? "Fluxo de produção atualizado."
          : "Fluxo de produção cadastrado.",
      )
      onClose()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar."
      form.setError("root.server", { message })
      toast.error(message)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pendente) onClose()
      }}
    >
      <DialogContent
        className="sm:max-w-2xl"
        finalFocus={() => {
          returnFocus()
          return false
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {initial ? "Editar fluxo de produção" : "Novo fluxo de produção"}
          </DialogTitle>
          <DialogDescription>
            Defina a sequência de setores pela qual a peça deve passar. Ex.:
            Corte → Costura → Acabamento → Revisão → Embalagem.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={form.handleSubmit(salvar)}
          className="space-y-5"
        >
          <fieldset disabled={pendente} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!form.formState.errors.name}>
                <FieldLabel htmlFor="fluxo-nome">Nome *</FieldLabel>
                <Input
                  id="fluxo-nome"
                  placeholder="Ex.: Camiseta Básica"
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register("name")}
                />
                {form.formState.errors.name && (
                  <FieldError>{form.formState.errors.name.message}</FieldError>
                )}
              </Field>

              <Field data-invalid={!!form.formState.errors.description}>
                <FieldLabel htmlFor="fluxo-descricao">
                  Descrição (opcional)
                </FieldLabel>
                <Input
                  id="fluxo-descricao"
                  placeholder="Para que produtos este fluxo serve"
                  {...form.register("description")}
                />
              </Field>
            </div>

            <Field data-invalid={!!form.formState.errors.steps}>
              <FieldLabel>Etapas do fluxo *</FieldLabel>

              <div className="space-y-2 rounded-lg border p-3">
                {fields.length === 0 && (
                  <Empty className="border-0 py-4">
                    <EmptyTitle>Nenhuma etapa adicionada</EmptyTitle>
                    <EmptyDescription>
                      Selecione um setor abaixo e clique em &quot;Adicionar
                      etapa&quot; para montar a sequência.
                    </EmptyDescription>
                  </Empty>
                )}

                {fields.map((field, indice) => {
                  const setor = setoresPorId.get(field.sectorId)
                  return (
                    <div
                      key={field.id}
                      className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                        {indice + 1}
                      </span>
                      <span className="flex-1 truncate text-sm font-medium">
                        {setor?.name ?? "Setor não encontrado"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Mover para cima"
                        disabled={indice === 0}
                        onClick={() => move(indice, indice - 1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Mover para baixo"
                        disabled={indice === fields.length - 1}
                        onClick={() => move(indice, indice + 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remover etapa"
                        onClick={() => remove(indice)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  )
                })}
              </div>

              {form.formState.errors.steps && (
                <FieldError>{form.formState.errors.steps.message}</FieldError>
              )}

              <div className="flex items-end gap-2 pt-1">
                <div className="flex-1 space-y-1.5">
                  <FieldLabel htmlFor="fluxo-adicionar-setor">
                    Adicionar setor ao fluxo
                  </FieldLabel>
                  <SearchSelect
                    id="fluxo-adicionar-setor"
                    label="Adicionar setor ao fluxo"
                    value={setorParaAdicionar}
                    onValueChange={setSetorParaAdicionar}
                    options={opcoesDisponiveis}
                    placeholder={
                      opcoesDisponiveis.length
                        ? "Escolha um setor..."
                        : "Nenhum setor ativo disponível"
                    }
                    disabled={opcoesDisponiveis.length === 0}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!setorParaAdicionar}
                  onClick={adicionarEtapa}
                >
                  <Plus /> Adicionar etapa
                </Button>
              </div>
              {setoresDisponiveis.every(
                (setor) => setor.status !== "Ativo",
              ) && (
                <p className="text-xs text-muted-foreground">
                  Cadastre setores ativos em Administração → Setores antes de
                  montar um fluxo.
                </p>
              )}
            </Field>

            {form.formState.errors.root?.server && (
              <Alert variant="destructive">
                <AlertDescription>
                  {form.formState.errors.root.server.message}
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit">
                {pendente
                  ? "Salvando…"
                  : initial
                    ? "Salvar alterações"
                    : "Cadastrar fluxo"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}

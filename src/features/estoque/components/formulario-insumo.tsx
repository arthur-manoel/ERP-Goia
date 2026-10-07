"use client"

import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AlertTriangle, CircleAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { useErp } from "@/features/erp/components/provedor"
import { insumoSchema, unidades, type Insumo, type Material } from "../schemas"

const opcoesTipo = [
  { value: "Tecido", label: "Tecido" },
  { value: "Aviamento", label: "Aviamento" },
]

export function FormularioInsumo({
  initial,
  onClose,
  returnFocus,
}: {
  initial?: Material
  onClose: () => void
  returnFocus: () => void
}) {
  const { save } = useErp()
  const form = useForm<Insumo>({
    resolver: zodResolver(insumoSchema),
    defaultValues: {
      name: initial?.name ?? "",
      code: initial?.code ?? "",
      category: initial?.category === "Aviamento" ? "Aviamento" : "Tecido",
      unit: initial?.unit ?? "m",
      cost: initial?.cost ?? 0,
      quantity: initial?.quantity ?? 0,
      minimum: initial?.minimum ?? 0,
      description: initial?.description ?? "",
    },
  })
  const saldo = useWatch({ control: form.control, name: "quantity" })
  const minimo = useWatch({ control: form.control, name: "minimum" })
  const unidade = useWatch({ control: form.control, name: "unit" })
  const pendente = form.formState.isSubmitting
  const abaixoDoMinimo =
    Number.isFinite(saldo) && Number.isFinite(minimo) && saldo <= minimo

  async function salvar(values: Insumo) {
    try {
      await save(
        "materials",
        {
          ...values,
          margin: 0,
          salePrice: values.cost,
          kind: "Comprado",
          components: [],
          variations: [],
        },
        initial?.id,
      )
      toast.success(initial ? "Insumo atualizado." : "Insumo cadastrado.")
      onClose()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Não foi possível salvar."
      form.setError("root.server", { message })
      toast.error(message)
    }
  }

  function erro(nome: keyof Insumo) {
    return form.formState.errors[nome]?.message
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pendente) onClose()
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        finalFocus={() => {
          returnFocus()
          return false
        }}
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Editar insumo" : "Novo insumo"}</DialogTitle>
          <DialogDescription>
            Preencha os dados do insumo. Campos com * são obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={form.handleSubmit(salvar)}
          className="space-y-6"
        >
          <fieldset disabled={pendente} className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!erro("name")} className="sm:col-span-2">
                <FieldLabel htmlFor="insumo-nome">Nome do insumo *</FieldLabel>
                <Input
                  id="insumo-nome"
                  placeholder="Ex.: Tricoline 100% algodão"
                  aria-invalid={!!erro("name")}
                  aria-describedby={
                    erro("name") ? "insumo-nome-erro" : undefined
                  }
                  {...form.register("name")}
                />
                {erro("name") && (
                  <FieldError id="insumo-nome-erro">{erro("name")}</FieldError>
                )}
              </Field>

              <Field data-invalid={!!erro("code")}>
                <FieldLabel htmlFor="insumo-codigo">Código *</FieldLabel>
                <Input
                  id="insumo-codigo"
                  placeholder="Ex.: TEC-001"
                  aria-invalid={!!erro("code")}
                  aria-describedby={
                    erro("code") ? "insumo-codigo-erro" : undefined
                  }
                  {...form.register("code")}
                />
                {erro("code") && (
                  <FieldError id="insumo-codigo-erro">
                    {erro("code")}
                  </FieldError>
                )}
              </Field>

              <Field data-invalid={!!erro("category")}>
                <FieldLabel htmlFor="insumo-tipo">Tipo *</FieldLabel>
                <Controller
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <SearchSelect
                      id="insumo-tipo"
                      ref={field.ref}
                      value={field.value}
                      options={opcoesTipo}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={!!erro("category")}
                      describedBy={
                        erro("category") ? "insumo-tipo-erro" : undefined
                      }
                      disabled={pendente}
                    />
                  )}
                />
                {erro("category") && (
                  <FieldError id="insumo-tipo-erro">
                    {erro("category")}
                  </FieldError>
                )}
              </Field>

              <Field data-invalid={!!erro("unit")}>
                <FieldLabel htmlFor="insumo-unidade">
                  Unidade de medida *
                </FieldLabel>
                <Controller
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <SearchSelect
                      id="insumo-unidade"
                      ref={field.ref}
                      value={field.value}
                      options={[...unidades]}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      invalid={!!erro("unit")}
                      describedBy={
                        erro("unit") ? "insumo-unidade-erro" : undefined
                      }
                      disabled={pendente}
                    />
                  )}
                />
                {erro("unit") && (
                  <FieldError id="insumo-unidade-erro">
                    {erro("unit")}
                  </FieldError>
                )}
              </Field>

              <Field data-invalid={!!erro("cost")}>
                <FieldLabel htmlFor="insumo-custo">
                  Preço de custo (R$) *
                </FieldLabel>
                <Input
                  id="insumo-custo"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  aria-invalid={!!erro("cost")}
                  aria-describedby={
                    erro("cost") ? "insumo-custo-erro" : undefined
                  }
                  {...form.register("cost", { valueAsNumber: true })}
                />
                {erro("cost") && (
                  <FieldError id="insumo-custo-erro">{erro("cost")}</FieldError>
                )}
              </Field>
            </div>

            <section
              aria-labelledby="controle-estoque"
              className="space-y-4 border-t pt-5"
            >
              <h3 id="controle-estoque" className="font-medium">
                Controle de estoque
              </h3>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field data-invalid={!!erro("quantity")}>
                  <FieldLabel htmlFor="insumo-saldo">Saldo atual *</FieldLabel>
                  <Input
                    id="insumo-saldo"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    aria-invalid={!!erro("quantity")}
                    aria-describedby={
                      erro("quantity") ? "insumo-saldo-erro" : undefined
                    }
                    {...form.register("quantity", { valueAsNumber: true })}
                  />
                  {erro("quantity") && (
                    <FieldError id="insumo-saldo-erro">
                      {erro("quantity")}
                    </FieldError>
                  )}
                </Field>
                <Field data-invalid={!!erro("minimum")}>
                  <FieldLabel htmlFor="insumo-minimo">
                    Estoque mínimo *
                  </FieldLabel>
                  <Input
                    id="insumo-minimo"
                    type="number"
                    min="0"
                    step="any"
                    inputMode="decimal"
                    aria-invalid={!!erro("minimum")}
                    aria-describedby={
                      erro("minimum") ? "insumo-minimo-erro" : undefined
                    }
                    {...form.register("minimum", { valueAsNumber: true })}
                  />
                  {erro("minimum") && (
                    <FieldError id="insumo-minimo-erro">
                      {erro("minimum")}
                    </FieldError>
                  )}
                </Field>
              </div>

              {abaixoDoMinimo && (
                <Alert variant={saldo === 0 ? "destructive" : "default"}>
                  {saldo === 0 ? <CircleAlert /> : <AlertTriangle />}
                  <AlertTitle>
                    {saldo === 0 ? "Sem estoque" : "Abaixo do mínimo"}
                  </AlertTitle>
                  <AlertDescription>
                    {saldo === 0
                      ? "Este insumo será sinalizado para reposição."
                      : saldo < minimo
                        ? `Faltam ${(minimo - saldo).toLocaleString("pt-BR")} ${unidade} para atingir o estoque mínimo.`
                        : "O saldo está exatamente no estoque mínimo."}
                  </AlertDescription>
                </Alert>
              )}
            </section>

            <Field data-invalid={!!erro("description")}>
              <FieldLabel htmlFor="insumo-descricao">
                Descrição (opcional)
              </FieldLabel>
              <Textarea
                id="insumo-descricao"
                placeholder="Composição, características ou observações do insumo."
                aria-invalid={!!erro("description")}
                aria-describedby={
                  erro("description") ? "insumo-descricao-erro" : undefined
                }
                {...form.register("description")}
              />
              {erro("description") && (
                <FieldError id="insumo-descricao-erro">
                  {erro("description")}
                </FieldError>
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
                    : "Cadastrar insumo"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}

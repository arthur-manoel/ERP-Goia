"use client"

import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  RodapeLimite,
  idRodapeLimite,
} from "@/components/ui/contador-caracteres"
import { LIMITES, tetoDigitacao } from "@/lib/validacao/texto"
import { useErp } from "@/features/erp/components/provedor"
import { setorSchema, type Setor } from "../schemas"

// O schema tem `.transform()` (ex.: tipo vazio vira "Outro"), então o valor
// "de entrada" (o que o usuário digita) e o valor "de saída" (o que é salvo)
// têm tipos diferentes. Os dois generics extras avisam o react-hook-form disso.
type ValoresFormulario = z.input<typeof setorSchema>
type ValoresSalvas = z.output<typeof setorSchema>

export function FormularioSetor({
  initial,
  onClose,
  returnFocus,
}: {
  initial?: Setor
  onClose: () => void
  returnFocus: () => void
}) {
  const { save } = useErp()
  const form = useForm<ValoresFormulario, unknown, ValoresSalvas>({
    resolver: zodResolver(setorSchema),
    defaultValues: {
      name: initial?.name ?? "",
      type: initial?.type ?? "",
      description: initial?.description ?? "",
      status: initial?.status ?? "Ativo",
    },
  })
  const pendente = form.formState.isSubmitting
  const nome = form.watch("name") ?? ""
  const tipo = form.watch("type") ?? ""
  const descricao = form.watch("description") ?? ""

  function erro(campo: keyof ValoresFormulario) {
    return form.formState.errors[campo]?.message
  }

  async function salvar(valores: ValoresSalvas) {
    try {
      await save("sectors", valores, initial?.id)
      toast.success(initial ? "Setor atualizado." : "Setor cadastrado.")
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
        className="sm:max-w-lg"
        finalFocus={() => {
          returnFocus()
          return false
        }}
      >
        <DialogHeader>
          <DialogTitle>{initial ? "Editar setor" : "Novo setor"}</DialogTitle>
          <DialogDescription>
            Setor é o local ou etapa onde uma atividade de produção acontece
            (ex.: Corte, Costura, Acabamento).
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={form.handleSubmit(salvar)}
          className="space-y-5"
        >
          <fieldset disabled={pendente} className="min-w-0 space-y-5">
            <Field data-invalid={!!erro("name")}>
              <FieldLabel htmlFor="setor-nome">Nome *</FieldLabel>
              <Input
                id="setor-nome"
                placeholder="Ex.: Corte"
                maxLength={tetoDigitacao(LIMITES.nomeSetor)}
                aria-invalid={!!erro("name")}
                aria-describedby={idRodapeLimite("setor-nome")}
                {...form.register("name")}
              />
              <RodapeLimite
                id="setor-nome"
                valor={nome}
                limite={LIMITES.nomeSetor}
                erro={erro("name")}
              />
            </Field>

            <Field data-invalid={!!erro("type")}>
              <FieldLabel htmlFor="setor-tipo">Tipo (opcional)</FieldLabel>
              <Input
                id="setor-tipo"
                placeholder='Ex.: Produção, Apoio — em branco usa "Outro"'
                maxLength={tetoDigitacao(LIMITES.tipoSetor)}
                aria-invalid={!!erro("type")}
                aria-describedby={idRodapeLimite("setor-tipo")}
                {...form.register("type")}
              />
              <RodapeLimite
                id="setor-tipo"
                valor={tipo}
                limite={LIMITES.tipoSetor}
                erro={erro("type")}
              />
            </Field>

            <Field data-invalid={!!erro("description")}>
              <FieldLabel htmlFor="setor-descricao">
                Descrição (opcional)
              </FieldLabel>
              <Textarea
                id="setor-descricao"
                placeholder="Detalhes da atividade realizada neste setor."
                maxLength={tetoDigitacao(LIMITES.descricaoCurta)}
                aria-invalid={!!erro("description")}
                aria-describedby={idRodapeLimite("setor-descricao")}
                {...form.register("description")}
              />
              <RodapeLimite
                id="setor-descricao"
                valor={descricao}
                limite={LIMITES.descricaoCurta}
                erro={erro("description")}
              />
            </Field>

            {form.formState.errors.root?.server && (
              <Alert variant="destructive">
                <AlertDescription className="[overflow-wrap:anywhere]">
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
                    : "Cadastrar setor"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}

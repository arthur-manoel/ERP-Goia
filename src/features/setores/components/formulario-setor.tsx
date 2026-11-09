"use client"

import { useEffect, useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { criarSetor, editarSetor, listarTiposSetor } from "../api"
import type { SetorApi, TipoSetor } from "../tipos"

const formularioSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome.")
    .max(100, "Use até 100 caracteres."),
  tipo: z.string().trim().max(80),
  descricao: z.string().trim().max(255, "Use até 255 caracteres."),
})
type Valores = z.infer<typeof formularioSchema>

export function FormularioSetor({
  setor,
  onClose,
  onSaved,
  returnFocus,
}: {
  /** Setor em edição; `null` cadastra um novo. */
  setor: SetorApi | null
  onClose: () => void
  onSaved: (setor: SetorApi) => Promise<void> | void
  returnFocus: () => void
}) {
  const { requisitar } = useAutenticacao()
  const [tipos, setTipos] = useState<TipoSetor[] | null>(null)
  const [erroTipos, setErroTipos] = useState("")
  const form = useForm<Valores>({
    resolver: zodResolver(formularioSchema),
    defaultValues: {
      nome: setor?.nome ?? "",
      tipo: setor?.tipo ?? "",
      descricao: setor?.descricao ?? "",
    },
  })
  const pendente = form.formState.isSubmitting

  // Tipos vêm da tabela tipos_setor (ativos da empresa), nunca de lista fixa.
  useEffect(() => {
    let ativo = true
    listarTiposSetor(requisitar).then(
      (lista) => ativo && setTipos(lista),
      (causa) => {
        if (!ativo) return
        setTipos([])
        setErroTipos(
          causa instanceof Error
            ? causa.message
            : "Não foi possível carregar os tipos de setor.",
        )
      },
    )
    return () => {
      ativo = false
    }
  }, [requisitar])

  async function salvar(valores: Valores) {
    try {
      const dados = { ...valores, ativo: setor?.ativo ?? true }
      const salvo = setor
        ? await editarSetor(requisitar, setor, dados)
        : await criarSetor(requisitar, dados)
      if (setor && salvo === setor) toast.info("Nenhuma alteração para salvar.")
      else toast.success(setor ? "Setor atualizado." : "Setor cadastrado.")
      await onSaved(salvo)
      onClose()
    } catch (causa) {
      const message =
        causa instanceof Error ? causa.message : "Não foi possível salvar."
      form.setError("root.server", { message })
      toast.error(message)
    }
  }

  const tipoAtualForaDaLista =
    !!setor?.tipo && !!tipos && !tipos.some((t) => t.nome === setor.tipo)

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
          <DialogTitle>{setor ? "Editar setor" : "Novo setor"}</DialogTitle>
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
          <fieldset disabled={pendente} className="space-y-5">
            <Field data-invalid={!!form.formState.errors.nome}>
              <FieldLabel htmlFor="setor-nome">Nome *</FieldLabel>
              <Input
                id="setor-nome"
                placeholder="Ex.: Corte"
                aria-invalid={!!form.formState.errors.nome}
                {...form.register("nome")}
              />
              {form.formState.errors.nome && (
                <FieldError>{form.formState.errors.nome.message}</FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="setor-tipo">Tipo (opcional)</FieldLabel>
              {tipos === null ? (
                <p className="text-sm text-muted-foreground" role="status">
                  Carregando tipos…
                </p>
              ) : tipos.length || tipoAtualForaDaLista ? (
                <NativeSelect id="setor-tipo" {...form.register("tipo")}>
                  <NativeSelectOption value="">
                    {setor ? "Manter tipo atual" : "Sem tipo (padrão)"}
                  </NativeSelectOption>
                  {tipoAtualForaDaLista && setor?.tipo && (
                    <NativeSelectOption value={setor.tipo}>
                      {setor.tipo} (atual)
                    </NativeSelectOption>
                  )}
                  {tipos.map((tipo) => (
                    <NativeSelectOption key={tipo.id} value={tipo.nome}>
                      {tipo.nome}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {erroTipos ||
                    "Nenhum tipo de setor ativo cadastrado para esta empresa."}
                </p>
              )}
            </Field>

            <Field data-invalid={!!form.formState.errors.descricao}>
              <FieldLabel htmlFor="setor-descricao">
                Descrição (opcional)
              </FieldLabel>
              <Textarea
                id="setor-descricao"
                placeholder="Detalhes da atividade realizada neste setor."
                aria-invalid={!!form.formState.errors.descricao}
                {...form.register("descricao")}
              />
              {form.formState.errors.descricao && (
                <FieldError>
                  {form.formState.errors.descricao.message}
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
                  : setor
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

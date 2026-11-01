"use client"

import { useId, type ComponentProps, type ReactNode } from "react"
import {
  get,
  type FieldErrors,
  type FieldValues,
  type Path,
  type UseFormRegister,
} from "react-hook-form"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"

/** O que os campos precisam do `useForm`; qualquer `UseFormReturn` satisfaz. */
export type ControleFormulario<T extends FieldValues> = {
  register: UseFormRegister<T>
  formState: { errors: FieldErrors<T> }
}

type AtributosAcessibilidade = {
  id: string
  invalid: boolean
  describedBy: string | undefined
}

type CampoBaseProps = {
  rotulo: string
  /** Mensagem de erro de validação do campo. */
  erro?: string
  ajuda?: string
  className?: string
  children: (a11y: AtributosAcessibilidade) => ReactNode
}

/**
 * Moldura de um campo: rótulo, controle, ajuda e erro ligados por
 * `aria-describedby`. Use direto para controles próprios (ex.: `SearchSelect`
 * dentro de um `Controller`).
 */
export function CampoFormulario({
  rotulo,
  erro,
  ajuda,
  className,
  children,
}: CampoBaseProps) {
  const id = useId()
  const idErro = `${id}-erro`
  const idAjuda = `${id}-ajuda`
  const descritoPor =
    [erro ? idErro : null, ajuda ? idAjuda : null].filter(Boolean).join(" ") ||
    undefined
  return (
    <Field data-invalid={!!erro} className={className}>
      <FieldLabel htmlFor={id}>{rotulo}</FieldLabel>
      {children({ id, invalid: !!erro, describedBy: descritoPor })}
      {ajuda && !erro && (
        <p id={idAjuda} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      )}
      {erro && <FieldError id={idErro}>{erro}</FieldError>}
    </Field>
  )
}

function mensagemDe<T extends FieldValues>(
  form: ControleFormulario<T>,
  nome: Path<T>,
) {
  const erro = get(form.formState.errors, nome) as
    { message?: unknown } | undefined
  return typeof erro?.message === "string" ? erro.message : undefined
}

type PropsComuns<T extends FieldValues> = {
  form: ControleFormulario<T>
  nome: Path<T>
  rotulo: string
  ajuda?: string
  className?: string
}

export function CampoTexto<T extends FieldValues>({
  form,
  nome,
  rotulo,
  ajuda,
  className,
  ...entrada
}: PropsComuns<T> &
  Omit<
    ComponentProps<typeof Input>,
    "form" | "name" | "id" | "aria-invalid" | "aria-describedby"
  >) {
  return (
    <CampoFormulario
      rotulo={rotulo}
      ajuda={ajuda}
      className={className}
      erro={mensagemDe(form, nome)}
    >
      {({ id, invalid, describedBy }) => (
        <Input
          id={id}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          {...entrada}
          {...form.register(nome)}
        />
      )}
    </CampoFormulario>
  )
}

export function CampoTextarea<T extends FieldValues>({
  form,
  nome,
  rotulo,
  ajuda,
  className,
  ...entrada
}: PropsComuns<T> &
  Omit<
    ComponentProps<typeof Textarea>,
    "form" | "name" | "id" | "aria-invalid" | "aria-describedby"
  >) {
  return (
    <CampoFormulario
      rotulo={rotulo}
      ajuda={ajuda}
      className={className}
      erro={mensagemDe(form, nome)}
    >
      {({ id, invalid, describedBy }) => (
        <Textarea
          id={id}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          {...entrada}
          {...form.register(nome)}
        />
      )}
    </CampoFormulario>
  )
}

export function CampoSelecao<T extends FieldValues>({
  form,
  nome,
  rotulo,
  ajuda,
  className,
  opcoes,
  opcaoVazia,
}: PropsComuns<T> & {
  opcoes: Array<{ valor: string; rotulo: string }>
  /** Texto da opção sem valor (ex.: "Selecione"). Sem ele, não há opção vazia. */
  opcaoVazia?: string
}) {
  return (
    <CampoFormulario
      rotulo={rotulo}
      ajuda={ajuda}
      className={className}
      erro={mensagemDe(form, nome)}
    >
      {({ id, invalid, describedBy }) => (
        <NativeSelect
          id={id}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          {...form.register(nome)}
        >
          {opcaoVazia !== undefined && (
            <NativeSelectOption value="">{opcaoVazia}</NativeSelectOption>
          )}
          {opcoes.map((opcao) => (
            <NativeSelectOption key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </CampoFormulario>
  )
}

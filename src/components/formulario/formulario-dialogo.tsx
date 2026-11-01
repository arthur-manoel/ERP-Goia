"use client"

import { useRef, useState, type FormEvent, type ReactNode } from "react"
import {
  useForm,
  type DefaultValues,
  type FieldValues,
  type Resolver,
  type UseFormReturn,
} from "react-hook-form"
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
import { CAMPO_GERAL } from "./resolver"

type Props<TEntrada extends FieldValues, TSaida> = {
  titulo: string
  descricao?: ReactNode
  /** Preenche os campos: valores do registro no modo de edição, vazios na criação. */
  valoresIniciais: DefaultValues<TEntrada>
  /** `zodResolver(schema)` ou `resolverComConversao(...)`. */
  resolver: Resolver<TEntrada, unknown, TSaida>
  /**
   * Grava na API. Lance `Error` para falhas: a mensagem aparece no formulário,
   * que continua aberto com os dados digitados.
   */
  aoEnviar: (dados: TSaida) => Promise<void>
  aoFechar: () => void
  rotuloSalvar?: string
  rotuloSalvando?: string
  mensagemSucesso?: string
  mensagemFalhaPadrao?: string
  /** Classes do `DialogContent` (largura, rolagem). */
  className?: string
  children: (form: UseFormReturn<TEntrada, unknown, TSaida>) => ReactNode
}

/**
 * Casca de formulário em diálogo para criar e editar registros: validação,
 * erros de campo e do servidor, estado de envio, bloqueio de envio duplicado,
 * e botões Salvar/Cancelar. Os campos e a chamada à API continuam do módulo.
 */
export function FormularioDialogo<TEntrada extends FieldValues, TSaida>({
  titulo,
  descricao,
  valoresIniciais,
  resolver,
  aoEnviar,
  aoFechar,
  rotuloSalvar = "Salvar",
  rotuloSalvando = "Salvando…",
  mensagemSucesso,
  mensagemFalhaPadrao = "Não foi possível salvar. Tente novamente.",
  className,
  children,
}: Props<TEntrada, TSaida>) {
  const form = useForm<TEntrada, unknown, TSaida>({
    resolver,
    defaultValues: valoresIniciais,
  })
  const enviando = useRef(false)
  // Estado próprio: o `isSubmitting` do react-hook-form volta a false quando
  // uma chamada repetida (barrada pela trava) termina, mesmo com a primeira
  // ainda em andamento.
  const [pendente, setPendente] = useState(false)
  const erros = form.formState.errors as Record<
    string,
    { message?: string } | undefined
  >
  const erroServidor = form.formState.errors.root?.server?.message
  const erroGeral = erros[CAMPO_GERAL]?.message

  async function gravar(dados: TSaida) {
    // O estado de `isSubmitting` só chega no próximo render; a trava evita
    // que um duplo clique grave duas vezes.
    if (enviando.current) return
    enviando.current = true
    setPendente(true)
    try {
      await aoEnviar(dados)
      if (mensagemSucesso) toast.success(mensagemSucesso)
      aoFechar()
    } catch (causa) {
      form.setError("root.server", {
        message:
          causa instanceof Error && causa.message
            ? causa.message
            : mensagemFalhaPadrao,
      })
    } finally {
      enviando.current = false
      setPendente(false)
    }
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    void form.handleSubmit(gravar)(evento)
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !pendente) aoFechar()
      }}
    >
      <DialogContent className={className ?? "sm:max-w-lg"}>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>
        <form noValidate onSubmit={enviar} className="space-y-5">
          <fieldset disabled={pendente} className="space-y-5">
            {children(form)}
            {(erroGeral || erroServidor) && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{erroServidor ?? erroGeral}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={aoFechar}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente}>
                {pendente ? rotuloSalvando : rotuloSalvar}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}

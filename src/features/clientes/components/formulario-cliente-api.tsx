"use client"

import { useCallback, useState, type FormEvent } from "react"
import { ZodError } from "zod"
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
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import {
  camposCliente,
  consultarCliente,
  salvarCliente,
  type ClienteApi,
  type CamposCliente,
} from "../api"
import { useConsultaCliente } from "../use-consulta"

type Props = {
  idEmpresa: number
  nomeEmpresa: string
  aoFechar: () => void
  aoSalvar: () => void
  retornarFoco: () => void
}

export function EditarClienteApi({
  idCliente,
  ...props
}: Props & { idCliente: number }) {
  const { requisitar } = useAutenticacao()
  const [revisao, setRevisao] = useState(0)
  const consultar = useCallback(
    (signal: AbortSignal) =>
      consultarCliente(requisitar, props.idEmpresa, idCliente, signal),
    [requisitar, props.idEmpresa, idCliente],
  )
  const consulta = useConsultaCliente(String(revisao), consultar)
  if (consulta.dados)
    return <FormularioClienteApi {...props} cliente={consulta.dados} />
  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto) {
          props.aoFechar()
          props.retornarFoco()
        }
      }}
    >
      <DialogContent className="sm:max-w-xl" finalFocus={() => false}>
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>
            Dados do cliente em {props.nomeEmpresa}.
          </DialogDescription>
        </DialogHeader>
        {consulta.erro ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p>{consulta.erro}</p>
              <Button
                variant="outline"
                onClick={() => setRevisao((v) => v + 1)}
              >
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <Skeleton className="h-64 w-full" aria-label="Carregando cliente" />
        )}
      </DialogContent>
    </Dialog>
  )
}

export function FormularioClienteApi({
  cliente,
  idEmpresa,
  nomeEmpresa,
  aoFechar,
  aoSalvar,
  retornarFoco,
}: Props & { cliente?: ClienteApi }) {
  const { requisitar } = useAutenticacao()
  const [campos, setCampos] = useState(() => camposCliente(cliente))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erro, setErro] = useState("")
  const [salvando, setSalvando] = useState(false)

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (salvando) return
    setErros({})
    setErro("")
    setSalvando(true)
    try {
      await salvarCliente(requisitar, idEmpresa, campos, cliente)
      toast.success(cliente ? "Cliente atualizado." : "Cliente cadastrado.")
      aoSalvar()
      aoFechar()
    } catch (causa) {
      if (causa instanceof ZodError) {
        const camposInvalidos: Record<string, string> = {}
        for (const issue of causa.issues) {
          if (issue.path.length)
            camposInvalidos[String(issue.path[0])] ??= issue.message
          else setErro(issue.message)
        }
        setErros(camposInvalidos)
      } else
        setErro(
          causa instanceof Error
            ? causa.message
            : "Não foi possível salvar o cliente.",
        )
    } finally {
      setSalvando(false)
    }
  }

  function campo(
    nome: keyof CamposCliente,
    rotulo: string,
    maxLength: number,
    tipo = "text",
    placeholder?: string,
  ) {
    const id = `cliente-${nome}`
    return (
      <Field data-invalid={!!erros[nome]}>
        <FieldLabel htmlFor={id}>{rotulo}</FieldLabel>
        <Input
          id={id}
          type={tipo}
          autoFocus={nome === "nomeRazaoSocial"}
          required={nome === "nomeRazaoSocial"}
          value={campos[nome]}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={!!erros[nome]}
          aria-describedby={erros[nome] ? `${id}-erro` : undefined}
          onChange={(e) => {
            const valor =
              nome === "estado" || nome === "cpfCnpj"
                ? e.target.value.toUpperCase()
                : e.target.value
            setCampos((atual) => ({ ...atual, [nome]: valor }))
            setErro("")
            setErros((atual) => {
              const proximos = { ...atual }
              delete proximos[nome]
              return proximos
            })
          }}
        />
        {erros[nome] && (
          <FieldError id={`${id}-erro`}>{erros[nome]}</FieldError>
        )}
      </Field>
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) aoFechar()
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        finalFocus={() => {
          retornarFoco()
          return false
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {cliente ? "Editar cliente" : "Novo cliente"}
          </DialogTitle>
          <DialogDescription>
            Cadastro de cliente em {nomeEmpresa}. Apenas o nome ou razão social
            é obrigatório.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={enviar} className="space-y-5">
          <fieldset disabled={salvando} className="space-y-5">
            {campo("nomeRazaoSocial", "Nome / razão social *", 150)}
            {campo(
              "cpfCnpj",
              "CPF / CNPJ (opcional)",
              20,
              "text",
              "Com ou sem máscara; CNPJ também aceita letras",
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {campo("email", "E-mail", 150, "email")}
              {campo("telefone", "Telefone", 30, "tel")}
            </div>
            <section className="space-y-4" aria-label="Endereço do cliente">
              <h3 className="text-sm font-medium">Endereço (opcional)</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {campo("cep", "CEP", 9, "text", "00000-000")}
                {campo("endereco", "Logradouro", 255)}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {campo("numero", "Número", 20)}
                {campo("complemento", "Complemento", 100)}
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {campo("bairro", "Bairro", 100)}
                {campo("cidade", "Cidade", 100)}
                {campo("estado", "UF", 2, "text", "Ex.: PE")}
              </div>
            </section>
            {erro && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{erro}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={aoFechar}>
                Cancelar
              </Button>
              <Button type="submit">
                {salvando
                  ? "Salvando…"
                  : cliente
                    ? "Salvar alterações"
                    : "Cadastrar cliente"}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  )
}

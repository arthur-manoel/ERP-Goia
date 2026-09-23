"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAutenticacao } from "../provedor-autenticacao"

const schema = z.object({
  email: z.email("Informe um e-mail válido."),
  senha: z.string().min(1, "Informe sua senha."),
})

export function FormularioLogin() {
  const router = useRouter()
  const { entrar } = useAutenticacao()
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState("")
  const [pendente, setPendente] = useState(false)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", senha: "" },
  })
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(async ({ email, senha }) => {
        setErro("")
        setPendente(true)
        try {
          await entrar(email, senha)
          router.push("/estoque")
        } catch (error) {
          setErro(error instanceof Error ? error.message : "Falha ao entrar.")
          form.resetField("senha")
          setMostrarSenha(false)
        } finally {
          setPendente(false)
        }
      })}
      className="space-y-6"
    >
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.email}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupAddon>
              <UserRound />
            </InputGroupAddon>
            <InputGroupInput
              id="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Seu e-mail cadastrado"
              {...form.register("email")}
              aria-invalid={!!form.formState.errors.email}
              aria-describedby={
                form.formState.errors.email ? "email-erro" : undefined
              }
            />
          </InputGroup>
          {form.formState.errors.email && (
            <FieldError id="email-erro">
              {form.formState.errors.email.message}
            </FieldError>
          )}
        </Field>
        <Field data-invalid={!!form.formState.errors.senha}>
          <FieldLabel htmlFor="senha">Senha</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupAddon>
              <LockKeyhole />
            </InputGroupAddon>
            <InputGroupInput
              id="senha"
              autoComplete="current-password"
              type={mostrarSenha ? "text" : "password"}
              placeholder="Digite sua senha"
              {...form.register("senha")}
              aria-invalid={!!form.formState.errors.senha}
              aria-describedby={
                form.formState.errors.senha ? "senha-erro" : undefined
              }
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                aria-pressed={mostrarSenha}
                size="icon-sm"
                onClick={() => setMostrarSenha((value) => !value)}
              >
                {mostrarSenha ? <EyeOff /> : <Eye />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
          {form.formState.errors.senha && (
            <FieldError id="senha-erro">
              {form.formState.errors.senha.message}
            </FieldError>
          )}
        </Field>
      </FieldGroup>
      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="h-11 w-full" disabled={pendente}>
        {pendente ? "Entrando…" : "Entrar"}
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Precisa de acesso ou esqueceu sua senha?
        <br />
        Procure o administrador da sua empresa.
      </p>
    </form>
  )
}

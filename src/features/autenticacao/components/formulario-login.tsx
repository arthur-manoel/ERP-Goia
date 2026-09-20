"use client"
import { useState } from "react"
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

const schema = z.object({
  usuario: z.string().trim().min(1, "Informe seu usuário."),
  senha: z.string().min(1, "Informe sua senha."),
})

export function FormularioLogin() {
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [aviso, setAviso] = useState(false)
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { usuario: "", senha: "" },
  })
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(() => {
        setAviso(true)
        form.resetField("senha")
        setMostrarSenha(false)
      })}
      className="space-y-6"
    >
      <FieldGroup>
        <Field data-invalid={!!form.formState.errors.usuario}>
          <FieldLabel htmlFor="usuario">Usuário</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupAddon>
              <UserRound />
            </InputGroupAddon>
            <InputGroupInput
              id="usuario"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Seu usuário na empresa"
              {...form.register("usuario")}
              aria-invalid={!!form.formState.errors.usuario}
              aria-describedby={
                form.formState.errors.usuario ? "usuario-erro" : undefined
              }
            />
          </InputGroup>
          {form.formState.errors.usuario && (
            <FieldError id="usuario-erro">
              {form.formState.errors.usuario.message}
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
      {aviso && (
        <Alert role="status">
          <AlertDescription>
            O acesso está em configuração. Entre em contato com o administrador
            da empresa.
          </AlertDescription>
        </Alert>
      )}
      <Button type="submit" className="h-11 w-full">
        Entrar
      </Button>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Precisa de acesso ou esqueceu sua senha?
        <br />
        Procure o administrador da sua empresa.
      </p>
    </form>
  )
}

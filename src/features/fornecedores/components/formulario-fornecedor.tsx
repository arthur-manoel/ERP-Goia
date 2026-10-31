"use client"

import { useState, type FormEvent } from "react"
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
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import {
  estados,
  formularioVazio,
  paraFormulario,
  paraPayload,
} from "../regras"
import { createFornecedorSchema, updateFornecedorSchema } from "../schemas"
import type { Fornecedor, FormularioFornecedor } from "../tipos"

const endpoint = "/api/fornecedores"

export function FormularioFornecedor({
  fornecedor,
  idEmpresa,
  onClose,
  onSaved,
}: {
  /** Registro em edição; `null` cadastra um novo fornecedor. */
  fornecedor: Fornecedor | null
  idEmpresa: number
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { requisitar } = useAutenticacao()
  const [formulario, setFormulario] = useState<FormularioFornecedor>(
    fornecedor ? paraFormulario(fornecedor) : formularioVazio,
  )
  const [erro, setErro] = useState("")
  const [salvando, setSalvando] = useState(false)

  function alterar(campo: keyof FormularioFornecedor, valor: string) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }))
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setErro("")

    // Mesmas regras da API (modules/fornecedores/schema.ts).
    const payload = paraPayload(formulario, fornecedor ? undefined : idEmpresa)
    const dados = fornecedor
      ? updateFornecedorSchema.safeParse(payload)
      : createFornecedorSchema.safeParse(payload)
    if (!dados.success) {
      setErro(dados.error.issues[0]?.message ?? "Dados inválidos.")
      return
    }

    setSalvando(true)
    try {
      const resposta = await requisitar(
        fornecedor ? `${endpoint}/${fornecedor.id}` : endpoint,
        {
          method: fornecedor ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dados.data),
        },
      )
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      await onSaved()
      toast.success(
        fornecedor ? "Fornecedor atualizado." : "Fornecedor cadastrado.",
      )
      onClose()
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : "Falha ao salvar.")
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) onClose()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {fornecedor ? "Editar fornecedor" : "Novo fornecedor"}
          </DialogTitle>
          <DialogDescription>
            {fornecedor
              ? `Atualize os dados de ${fornecedor.razao_social}.`
              : "Informe os dados para cadastrar um novo fornecedor."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="forn-razao">Razão social *</FieldLabel>
              <Input
                id="forn-razao"
                placeholder="Ex.: Empresa Exemplo Ltda"
                value={formulario.razaoSocial}
                onChange={(e) => alterar("razaoSocial", e.target.value)}
                maxLength={150}
                autoFocus
                disabled={salvando}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="forn-fantasia">Nome fantasia</FieldLabel>
              <Input
                id="forn-fantasia"
                placeholder="Ex.: Exemplo"
                value={formulario.nomeFantasia}
                onChange={(e) => alterar("nomeFantasia", e.target.value)}
                maxLength={150}
                disabled={salvando}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="forn-cnpj">CNPJ</FieldLabel>
              <Input
                id="forn-cnpj"
                className="font-mono"
                placeholder="Ex.: 00.000.000/0001-00"
                value={formulario.cnpj}
                onChange={(e) => alterar("cnpj", e.target.value)}
                disabled={salvando}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="forn-ie">Inscrição estadual</FieldLabel>
              <Input
                id="forn-ie"
                placeholder="Ex.: 000000000"
                value={formulario.inscricaoEstadual}
                onChange={(e) => alterar("inscricaoEstadual", e.target.value)}
                maxLength={30}
                disabled={salvando}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="forn-status">Situação</FieldLabel>
              <SearchSelect
                id="forn-status"
                value={formulario.status}
                onValueChange={(valor) => alterar("status", valor)}
                label="Situação"
                disabled={salvando}
                options={[
                  { value: "ATIVO", label: "Ativo" },
                  { value: "INATIVO", label: "Inativo" },
                ]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="forn-email">E-mail</FieldLabel>
              <Input
                id="forn-email"
                type="email"
                placeholder="Ex.: contato@exemplo.com.br"
                value={formulario.email}
                onChange={(e) => alterar("email", e.target.value)}
                maxLength={150}
                disabled={salvando}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="forn-telefone">Telefone</FieldLabel>
              <Input
                id="forn-telefone"
                placeholder="Ex.: (00) 0000-0000"
                value={formulario.telefone}
                onChange={(e) => alterar("telefone", e.target.value)}
                maxLength={30}
                disabled={salvando}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="forn-cep">CEP</FieldLabel>
              <Input
                id="forn-cep"
                placeholder="Ex.: 00000-000"
                value={formulario.cep}
                onChange={(e) => alterar("cep", e.target.value)}
                maxLength={10}
                disabled={salvando}
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="forn-endereco">Endereço</FieldLabel>
              <Input
                id="forn-endereco"
                placeholder="Ex.: Nome da rua ou avenida"
                value={formulario.endereco}
                onChange={(e) => alterar("endereco", e.target.value)}
                maxLength={255}
                disabled={salvando}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="forn-numero">Número</FieldLabel>
              <Input
                id="forn-numero"
                placeholder="Ex.: 123"
                value={formulario.numero}
                onChange={(e) => alterar("numero", e.target.value)}
                maxLength={20}
                disabled={salvando}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="forn-complemento">Complemento</FieldLabel>
              <Input
                id="forn-complemento"
                placeholder="Ex.: Sala, galpão, bloco"
                value={formulario.complemento}
                onChange={(e) => alterar("complemento", e.target.value)}
                maxLength={100}
                disabled={salvando}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="forn-bairro">Bairro</FieldLabel>
              <Input
                id="forn-bairro"
                placeholder="Ex.: Nome do bairro"
                value={formulario.bairro}
                onChange={(e) => alterar("bairro", e.target.value)}
                maxLength={100}
                disabled={salvando}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="forn-cidade">Cidade</FieldLabel>
              <Input
                id="forn-cidade"
                placeholder="Ex.: Nome da cidade"
                value={formulario.cidade}
                onChange={(e) => alterar("cidade", e.target.value)}
                maxLength={100}
                disabled={salvando}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="forn-estado">Estado (UF)</FieldLabel>
              <SearchSelect
                id="forn-estado"
                value={formulario.estado}
                onValueChange={(valor) => alterar("estado", valor)}
                label="Estado (UF)"
                placeholder="Digite ou escolha a UF"
                disabled={salvando}
                options={estados}
              />
            </Field>
          </div>

          {erro && <FieldError role="alert">{erro}</FieldError>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

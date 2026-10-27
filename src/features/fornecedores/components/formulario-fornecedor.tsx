"use client"

import { useMemo } from "react"
import { Controller } from "react-hook-form"
import { CampoFormulario, CampoTexto } from "@/components/formulario/campos"
import { FormularioDialogo } from "@/components/formulario/formulario-dialogo"
import { resolverComConversao } from "@/components/formulario/resolver"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { endpointFornecedores } from "../fonte"
import {
  estados,
  formularioVazio,
  paraFormulario,
  paraPayload,
} from "../regras"
import { createFornecedorSchema, updateFornecedorSchema } from "../schemas"
import type {
  Fornecedor,
  FormularioFornecedor as ValoresFormulario,
} from "../tipos"

/** Campo do payload da API → campo do formulário, para exibir cada erro no seu campo. */
const campoDoPayload: Record<string, keyof ValoresFormulario> = {
  razao_social: "razaoSocial",
  nome_fantasia: "nomeFantasia",
  cnpj: "cnpj",
  inscricao_estadual: "inscricaoEstadual",
  email: "email",
  telefone: "telefone",
  cep: "cep",
  endereco: "endereco",
  numero: "numero",
  complemento: "complemento",
  bairro: "bairro",
  cidade: "cidade",
  estado: "estado",
  status: "status",
}

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
  onSaved: () => void | Promise<void>
}) {
  const { requisitar } = useAutenticacao()
  const editando = fornecedor !== null

  // Mesmas regras da API (modules/fornecedores/schema.ts): o schema valida o
  // payload já convertido, não o texto digitado.
  const resolver = useMemo(
    () =>
      resolverComConversao<ValoresFormulario, unknown>({
        schema: editando ? updateFornecedorSchema : createFornecedorSchema,
        converter: (valores) =>
          paraPayload(valores, editando ? undefined : idEmpresa),
        campos: campoDoPayload,
      }),
    [editando, idEmpresa],
  )

  async function enviar(payload: unknown) {
    const resposta = await requisitar(
      fornecedor
        ? `${endpointFornecedores}/${fornecedor.id}`
        : endpointFornecedores,
      {
        method: fornecedor ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    )
    if (!resposta.ok) throw new Error(await mensagemErro(resposta))
    await onSaved()
  }

  return (
    <FormularioDialogo<ValoresFormulario, unknown>
      titulo={editando ? "Editar fornecedor" : "Novo fornecedor"}
      descricao={
        fornecedor
          ? `Atualize os dados de ${fornecedor.razao_social}.`
          : "Informe os dados para cadastrar um novo fornecedor."
      }
      valoresIniciais={
        fornecedor ? paraFormulario(fornecedor) : formularioVazio
      }
      resolver={resolver}
      aoEnviar={enviar}
      aoFechar={onClose}
      mensagemSucesso={
        editando ? "Fornecedor atualizado." : "Fornecedor cadastrado."
      }
      mensagemFalhaPadrao="Falha ao salvar."
      className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <CampoTexto
            form={form}
            nome="razaoSocial"
            rotulo="Razão social *"
            className="sm:col-span-2"
            placeholder="Ex.: Empresa Exemplo Ltda"
            maxLength={150}
            autoFocus
          />
          <CampoTexto
            form={form}
            nome="nomeFantasia"
            rotulo="Nome fantasia"
            placeholder="Ex.: Exemplo"
            maxLength={150}
          />
          <CampoTexto
            form={form}
            nome="cnpj"
            rotulo="CNPJ"
            className="font-mono"
            placeholder="Ex.: 00.000.000/0001-00"
          />
          <CampoTexto
            form={form}
            nome="inscricaoEstadual"
            rotulo="Inscrição estadual"
            placeholder="Ex.: 000000000"
            maxLength={30}
          />
          <Controller
            control={form.control}
            name="status"
            render={({ field, fieldState }) => (
              <CampoFormulario
                rotulo="Situação"
                erro={fieldState.error?.message}
              >
                {({ id, invalid, describedBy }) => (
                  <SearchSelect
                    id={id}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    label="Situação"
                    invalid={invalid}
                    describedBy={describedBy}
                    options={[
                      { value: "ATIVO", label: "Ativo" },
                      { value: "INATIVO", label: "Inativo" },
                    ]}
                  />
                )}
              </CampoFormulario>
            )}
          />
          <CampoTexto
            form={form}
            nome="email"
            rotulo="E-mail"
            type="email"
            placeholder="Ex.: contato@exemplo.com.br"
            maxLength={150}
          />
          <CampoTexto
            form={form}
            nome="telefone"
            rotulo="Telefone"
            placeholder="Ex.: (00) 0000-0000"
            maxLength={30}
          />
          <CampoTexto
            form={form}
            nome="cep"
            rotulo="CEP"
            placeholder="Ex.: 00000-000"
            maxLength={10}
          />
          <CampoTexto
            form={form}
            nome="endereco"
            rotulo="Endereço"
            className="sm:col-span-2"
            placeholder="Ex.: Nome da rua ou avenida"
            maxLength={255}
          />
          <CampoTexto
            form={form}
            nome="numero"
            rotulo="Número"
            placeholder="Ex.: 123"
            maxLength={20}
          />
          <CampoTexto
            form={form}
            nome="complemento"
            rotulo="Complemento"
            placeholder="Ex.: Sala, galpão, bloco"
            maxLength={100}
          />
          <CampoTexto
            form={form}
            nome="bairro"
            rotulo="Bairro"
            placeholder="Ex.: Nome do bairro"
            maxLength={100}
          />
          <CampoTexto
            form={form}
            nome="cidade"
            rotulo="Cidade"
            placeholder="Ex.: Nome da cidade"
            maxLength={100}
          />
          <Controller
            control={form.control}
            name="estado"
            render={({ field, fieldState }) => (
              <CampoFormulario
                rotulo="Estado (UF)"
                erro={fieldState.error?.message}
              >
                {({ id, invalid, describedBy }) => (
                  <SearchSelect
                    id={id}
                    value={field.value}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                    label="Estado (UF)"
                    placeholder="Digite ou escolha a UF"
                    invalid={invalid}
                    describedBy={describedBy}
                    options={estados}
                  />
                )}
              </CampoFormulario>
            )}
          />
        </div>
      )}
    </FormularioDialogo>
  )
}

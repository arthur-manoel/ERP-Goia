"use client"

import { useMemo } from "react"
import { CampoSelecao, CampoTexto } from "@/components/formulario/campos"
import { FormularioDialogo } from "@/components/formulario/formulario-dialogo"
import { resolverComConversao } from "@/components/formulario/resolver"
import { estados } from "@/features/fornecedores/regras"
import type { ApiEmpresas } from "../api"
import {
  cadastroEmpresaSchema,
  edicaoEmpresaSchema,
  formularioEmpresa,
  payloadEmpresa,
  type DadosEmpresa,
  type EdicaoEmpresa,
  type Empresa,
  type FormularioEmpresa as Valores,
} from "../schemas"

const rotulos: Record<keyof Valores, string> = {
  razao_social: "Razão social *",
  nome_fantasia: "Nome fantasia",
  cnpj: "CNPJ *",
  inscricao_estadual: "Inscrição estadual",
  email: "E-mail",
  telefone: "Telefone",
  endereco: "Endereço",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  estado: "UF",
  cep: "CEP",
  logo_url: "URL da logo",
  cor_tema: "Cor do tema *",
}
const limites: Record<keyof Valores, number> = {
  razao_social: 150,
  nome_fantasia: 150,
  cnpj: 18,
  inscricao_estadual: 30,
  email: 150,
  telefone: 30,
  endereco: 255,
  numero: 20,
  complemento: 100,
  bairro: 100,
  cidade: 100,
  estado: 2,
  cep: 9,
  logo_url: 2048,
  cor_tema: 7,
}

export function FormularioEmpresa({
  empresa,
  api,
  aoFechar,
  aoSalvar,
}: {
  empresa: Empresa | null
  api: ApiEmpresas
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const iniciais = formularioEmpresa(empresa ?? undefined)
  const resolver = useMemo(
    () =>
      resolverComConversao<Valores, EdicaoEmpresa>({
        schema: empresa ? edicaoEmpresaSchema : cadastroEmpresaSchema,
        converter: (valores) => payloadEmpresa(valores, empresa ?? undefined),
        campos: Object.fromEntries(
          Object.keys(rotulos).map((campo) => [campo, campo]),
        ),
      }),
    [empresa],
  )
  return (
    <FormularioDialogo<Valores, EdicaoEmpresa>
      titulo={empresa ? "Editar empresa" : "Nova empresa"}
      descricao="Dados cadastrais, contato, endereço e identidade visual. Campos opcionais em branco serão removidos ao salvar."
      valoresIniciais={iniciais}
      resolver={resolver}
      aoFechar={aoFechar}
      aoEnviar={async (dados) => {
        if (empresa && !Object.keys(dados).length) return
        if (empresa) await api.editar(empresa.id, dados)
        else await api.criar(dados as DadosEmpresa)
        aoSalvar()
      }}
      mensagemSucesso={empresa ? "Empresa atualizada." : "Empresa cadastrada."}
      className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"
    >
      {(form) => (
        <>
          {(
            [
              [
                "Identificação fiscal",
                ["razao_social", "nome_fantasia", "cnpj", "inscricao_estadual"],
              ],
              ["Contato", ["email", "telefone"]],
              [
                "Endereço",
                [
                  "cep",
                  "endereco",
                  "numero",
                  "complemento",
                  "bairro",
                  "cidade",
                  "estado",
                ],
              ],
              ["Identidade visual", ["logo_url", "cor_tema"]],
            ] as [string, (keyof Valores)[]][]
          ).map(([titulo, campos]) => (
            <section key={titulo} className="space-y-3" aria-label={titulo}>
              <h3 className="text-sm font-medium">{titulo}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {campos.map((campo) =>
                  campo === "estado" ? (
                    <CampoSelecao
                      key={campo}
                      form={form}
                      nome={campo}
                      rotulo={rotulos[campo]}
                      opcaoVazia="Não informada"
                      opcoes={estados.map((uf) => ({
                        valor: uf.value,
                        rotulo: uf.label,
                      }))}
                    />
                  ) : (
                    <CampoTexto
                      key={campo}
                      form={form}
                      nome={campo}
                      rotulo={rotulos[campo]}
                      maxLength={limites[campo]}
                      type={campo === "email" ? "email" : "text"}
                      inputMode={
                        campo === "cnpj" || campo === "cep"
                          ? "numeric"
                          : campo === "telefone"
                            ? "tel"
                            : "text"
                      }
                      placeholder={
                        campo === "logo_url"
                          ? "https://..."
                          : campo === "cor_tema"
                            ? "#22c55e"
                            : undefined
                      }
                      ajuda={
                        campo === "cnpj" && empresa
                          ? "A alteração do CNPJ exige administração global."
                          : campo === "logo_url"
                            ? "Use uma URL HTTPS, sem usuário ou senha. A logo não será baixada automaticamente."
                            : undefined
                      }
                    />
                  ),
                )}
              </div>
            </section>
          ))}
          <p className="text-xs text-muted-foreground">
            A cor e a logo são dados do cadastro. A prévia não altera o tema da
            sessão.
          </p>
          {/^#[0-9a-fA-F]{6}$/.test(form.watch("cor_tema")) && (
            <div
              className="flex items-center gap-2 rounded-md border p-3"
              aria-label="Prévia da cor do tema"
            >
              <span
                className="size-6 rounded-full border"
                style={{ backgroundColor: form.watch("cor_tema") }}
              />
              <span className="text-sm">
                {form.watch("razao_social") || "Nome da empresa"} ·{" "}
                {form.watch("cor_tema")}
              </span>
            </div>
          )}
        </>
      )}
    </FormularioDialogo>
  )
}

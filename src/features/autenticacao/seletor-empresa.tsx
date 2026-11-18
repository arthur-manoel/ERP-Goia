"use client"

import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { useAutenticacao } from "./provedor-autenticacao"

/** Seletor da empresa ativa; só aparece quando o usuário tem mais de uma. */
export function SeletorEmpresa() {
  const { empresa, empresas, selecionarEmpresa } = useAutenticacao()
  if (empresas.length < 2) return null
  return (
    <SearchSelect
      label="Empresa ativa"
      placeholder="Selecione uma empresa"
      className="w-full sm:w-80"
      value={empresa ? String(empresa.id) : ""}
      onValueChange={(valor) => selecionarEmpresa(Number(valor))}
      options={empresas.map((item) => ({
        value: String(item.id),
        label: item.nome,
      }))}
    />
  )
}

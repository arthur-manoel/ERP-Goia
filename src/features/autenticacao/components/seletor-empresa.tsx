"use client"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { useAutenticacao } from "../provedor-autenticacao"

export function SeletorEmpresa() {
  const { estado, empresas, empresa, selecionarEmpresa } = useAutenticacao()
  if (
    estado !== "autenticado" ||
    empresas.length === 0 ||
    (empresa && empresas.length === 1)
  )
    return null
  return (
    <SearchSelect
      label="Empresa ativa"
      placeholder="Selecione uma empresa"
      className="w-full sm:w-64"
      value={empresa ? String(empresa.id) : ""}
      onValueChange={(value) => selecionarEmpresa(Number(value))}
      options={empresas.map((e) => ({ value: String(e.id), label: e.nome }))}
    />
  )
}

"use client"
import Link from "next/link"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { useComprasApi, type ComprasApi } from "./api"

/**
 * Casca comum das telas de compras: cabeçalho, estados de autenticação/empresa e seletor de empresa.
 * O conteúdo é remontado ao trocar de empresa (key), descartando filtros e dados da empresa anterior.
 */
export function ShellCompras({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao: string
  children: (api: ComprasApi) => React.ReactNode
}) {
  const { estado, empresas, empresa, selecionarEmpresa } = useAutenticacao()
  const api = useComprasApi()
  const cabecalho = <PageHeader titulo={titulo} descricao={descricao} />

  if (estado === "carregando")
    return (<>{cabecalho}<Skeleton role="status" aria-label="Carregando" className="h-80 w-full" /></>)
  if (estado === "anonimo")
    return (
      <>
        {cabecalho}
        <Alert>
          <AlertDescription>
            Entre na sua conta para acessar as compras.{" "}
            <Link href="/login" className="underline">Ir para o login</Link>
          </AlertDescription>
        </Alert>
      </>
    )
  if (empresas.length === 0)
    return (
      <>
        {cabecalho}
        <Alert><AlertDescription>Seu usuário não tem acesso a nenhuma empresa ativa.</AlertDescription></Alert>
      </>
    )
  const seletor =
    empresas.length > 1 ? (
      <SearchSelect
        value={empresa ? String(empresa.id) : ""}
        onValueChange={(valor) => selecionarEmpresa(Number(valor))}
        label="Empresa ativa"
        className="w-full sm:w-80"
        options={empresas.map((e) => ({ value: String(e.id), label: e.nome }))}
      />
    ) : null
  if (!empresa)
    return (<>{cabecalho}<p>Selecione a empresa para continuar.</p>{seletor}</>)
  return (
    <>
      {cabecalho}
      {seletor}
      <div key={empresa.id} className="flex flex-col gap-6">{children(api)}</div>
    </>
  )
}

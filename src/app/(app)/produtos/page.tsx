import type { Metadata } from "next"
import { PageHeader } from "@/components/layout/page-header"
import { FiltrosProdutos } from "@/features/produtos/components/filtros-produtos"
import { TabelaProdutos } from "@/features/produtos/components/tabela-produtos"
import {
  listarProdutos,
  normalizarPagina,
  normalizarStatusProduto,
} from "@/features/produtos/queries"

export const metadata: Metadata = { title: "Produtos" }

function valorUnico(valor: string | string[] | undefined) {
  return typeof valor === "string" ? valor : undefined
}

export default async function Page(props: PageProps<"/produtos">) {
  const searchParams = await props.searchParams
  const busca = valorUnico(searchParams.busca)
  const status = normalizarStatusProduto(valorUnico(searchParams.status))
  const pagina = normalizarPagina(valorUnico(searchParams.pagina))
  const resultado = await listarProdutos({ busca, status, pagina })

  return (
    <>
      <PageHeader
        titulo="Produtos"
        descricao="Produtos, variações, dados por empresa e fornecedores."
      />
      <FiltrosProdutos busca={busca} status={status} />
      <TabelaProdutos {...resultado} busca={busca} status={status} />
    </>
  )
}

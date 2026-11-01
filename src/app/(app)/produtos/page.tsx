import type { Metadata } from "next"
import { EmConstrucao } from "@/components/layout/em-construcao"
import { PageHeader } from "@/components/layout/page-header"

export const metadata: Metadata = { title: "Produtos" }

export default function Page() {
  return (
    <>
      <PageHeader
        titulo="Produtos"
        descricao="Produtos, variações, dados por empresa e fornecedores."
      />
      <EmConstrucao
        tabelas={[
          "produtos",
          "produto_empresa",
          "produto_variacoes",
          "produto_fornecedor",
        ]}
      />
    </>
  )
}

import type { Metadata } from "next"
import { connection } from "next/server"
import { TelaPosicoesEstoque } from "@/features/estoque-minimo/components/tela-posicoes-estoque"
import { carregarPosicoesEstoque } from "@/features/estoque-minimo/queries"

export const metadata: Metadata = { title: "Insumos" }

export default async function Page() {
  await connection()
  const { posicoes, podeEditar } = await carregarPosicoesEstoque({
    somenteInsumos: true,
  })
  return (
    <TelaPosicoesEstoque
      posicoes={posicoes}
      podeEditar={podeEditar}
      titulo="Insumos"
      descricao="Tecidos, aviamentos e demais insumos por local de estoque."
    />
  )
}

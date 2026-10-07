import type { Metadata } from "next"
import { TelaPosicoesEstoque } from "@/features/estoque-minimo/components/tela-posicoes-estoque"

export const metadata: Metadata = { title: "Insumos" }

export default function Page() {
  return (
    <TelaPosicoesEstoque
      somenteInsumos
      titulo="Insumos"
      descricao="Tecidos, aviamentos e demais insumos por local de estoque."
    />
  )
}

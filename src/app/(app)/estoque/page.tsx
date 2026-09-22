import type { Metadata } from "next"
import { connection } from "next/server"
import { TelaPosicoesEstoque } from "@/features/estoque-minimo/components/tela-posicoes-estoque"
import { carregarPosicoesEstoque } from "@/features/estoque-minimo/queries"

export const metadata: Metadata = { title: "Saldos de estoque" }

export default async function Page() {
  await connection()
  const { posicoes, podeEditar } = await carregarPosicoesEstoque()
  return (
    <TelaPosicoesEstoque
      posicoes={posicoes}
      podeEditar={podeEditar}
      titulo="Saldos de estoque"
      descricao="Estoque físico e mínimo configurado por depósito ou localização."
    />
  )
}

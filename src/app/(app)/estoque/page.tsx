import type { Metadata } from "next"
import { TelaPosicoesEstoque } from "@/features/estoque-minimo/components/tela-posicoes-estoque"

export const metadata: Metadata = { title: "Saldos de estoque" }

export default function Page() {
  return (
    <TelaPosicoesEstoque
      titulo="Saldos de estoque"
      descricao="Estoque físico e mínimo configurado por depósito ou localização."
    />
  )
}

import type { Metadata } from "next"
import { TriangleAlert } from "lucide-react"
import { MovimentacaoTela } from "@/components/movimentacao/movimentacao-tela"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { obterOpcoesMovimentacao } from "@/lib/movimentacao/opcoes"

export const metadata: Metadata = { title: "Movimentação" }

export default async function Page() {
  const opcoes = await obterOpcoesMovimentacao()

  return (
    <>
      <PageHeader
        titulo="Movimentação"
        descricao="Registre entradas, saídas e transferências de estoque."
      />
      {opcoes.estado === "ok" ? (
        <MovimentacaoTela opcoes={opcoes.dados} />
      ) : (
        <Alert variant="destructive" className="max-w-2xl">
          <TriangleAlert aria-hidden />
          <AlertTitle>Não foi possível carregar itens e estoques</AlertTitle>
          <AlertDescription>
            Atualize a página para tentar de novo.
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

import type { Metadata } from "next"
import { TriangleAlert } from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { HistoricoMovimentacoes } from "@/components/movimentacao/historico-movimentacoes"
import { MovimentacaoTela } from "@/components/movimentacao/movimentacao-tela"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { obterOpcoesMovimentacao } from "@/lib/movimentacao/opcoes"

export const metadata: Metadata = { title: "Movimentação" }

export default async function Page() {
  const opcoes = await obterOpcoesMovimentacao()

  return (
    <>
      <PageHeader
        titulo="Movimentação"
        descricao="Registre entradas, saídas e transferências, e consulte o histórico por período."
      />
      {opcoes.estado === "ok" ? (
        <Tabs defaultValue="nova">
          <TabsList>
            <TabsTrigger value="nova">Nova movimentação</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>
          <TabsContent value="nova" className="pt-4">
            <MovimentacaoTela opcoes={opcoes.dados} />
          </TabsContent>
          <TabsContent value="historico" className="pt-4">
            <HistoricoMovimentacoes itens={opcoes.dados.itens} />
          </TabsContent>
        </Tabs>
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

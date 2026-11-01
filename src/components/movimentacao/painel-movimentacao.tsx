"use client"

import { useEffect, useState } from "react"
import { TriangleAlert } from "lucide-react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import type { OpcoesMovimentacao } from "@/lib/movimentacao/tipos"
import { HistoricoMovimentacoes } from "./historico-movimentacoes"
import { MovimentacaoTela } from "./movimentacao-tela"
import { PosicaoAtual } from "./posicao-atual"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function PainelMovimentacao() {
  const { estado, empresa, requisitar } = useAutenticacao()
  const [resultado, setResultado] = useState<{
    empresaId: number
    dados: OpcoesMovimentacao
  } | null>(null)
  const [empresaComErro, setEmpresaComErro] = useState<number | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let ativo = true
    if (estado !== "autenticado" || !empresa)
      return () => {
        ativo = false
      }

    void requisitar("/api/estoque/movimentacoes/opcoes")
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar opções.")
        return (await response.json()) as OpcoesMovimentacao
      })
      .then((dados) => {
        if (ativo) {
          setResultado({ empresaId: empresa.id, dados })
          setEmpresaComErro(null)
        }
      })
      .catch(() => {
        if (ativo) setEmpresaComErro(empresa.id)
      })

    return () => {
      ativo = false
    }
  }, [empresa, estado, requisitar, tentativa])

  const opcoes =
    empresa && resultado?.empresaId === empresa.id ? resultado.dados : null
  const erro = !!empresa && empresaComErro === empresa.id

  if (erro)
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <TriangleAlert aria-hidden />
        <AlertTitle>Não foi possível carregar itens e estoques</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          Atualize as opções para tentar de novo.
          <Button variant="outline" onClick={() => setTentativa((n) => n + 1)}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    )

  if (estado !== "autenticado" || !empresa || !opcoes)
    return (
      <div
        role="status"
        aria-label="Carregando opções de movimentação"
        className="space-y-4"
      >
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )

  return (
    <Tabs defaultValue="posicao">
      <TabsList>
        <TabsTrigger value="posicao">Posição atual</TabsTrigger>
        <TabsTrigger value="nova">Nova movimentação</TabsTrigger>
        <TabsTrigger value="historico">Histórico</TabsTrigger>
      </TabsList>
      <TabsContent value="posicao" className="pt-4">
        <PosicaoAtual />
      </TabsContent>
      <TabsContent value="nova" className="pt-4">
        <MovimentacaoTela opcoes={opcoes} />
      </TabsContent>
      <TabsContent value="historico" className="pt-4">
        <HistoricoMovimentacoes itens={opcoes.itens} />
      </TabsContent>
    </Tabs>
  )
}

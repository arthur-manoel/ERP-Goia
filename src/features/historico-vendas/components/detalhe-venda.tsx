"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import {
  formatarDataHora,
  formatarMoeda,
  formatarQuantidade,
} from "@/lib/formatacao"
import {
  descreverMudanca,
  formatarDiaIso,
  rotuloFinanceiro,
  rotuloParcela,
  rotuloStatus,
  variacaoParcela,
  variacaoStatus,
} from "../regras"
import type { Faturamento, VendaLista } from "../tipos"

/** Itens, parcelas e mudanças de status de uma venda. */
export function DetalheVenda({
  venda,
  onClose,
}: {
  venda: VendaLista
  onClose: () => void
}) {
  const { requisitar } = useAutenticacao()
  const [faturamento, setFaturamento] = useState<Faturamento | null>(null)
  const [erro, setErro] = useState("")

  useEffect(() => {
    const controle = new AbortController()
    void requisitar(`/api/vendas/${venda.id}/faturamento`, {
      signal: controle.signal,
    })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error(await mensagemErro(resposta))
        return (await resposta.json()) as Faturamento
      })
      .then((dados) => {
        if (!controle.signal.aborted) setFaturamento(dados)
      })
      .catch((causa: unknown) => {
        if (controle.signal.aborted) return
        setErro(
          causa instanceof Error
            ? causa.message
            : "Não foi possível carregar o faturamento.",
        )
      })
    return () => controle.abort()
  }, [requisitar, venda.id])

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Venda {venda.numero}</DialogTitle>
          <DialogDescription>
            {venda.cliente ?? "Sem cliente"} ·{" "}
            {formatarDataHora(new Date(venda.data))}
            {venda.pedido !== "—" && ` · Pedido ${venda.pedido}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={variacaoStatus(venda.status)}>
            {rotuloStatus[venda.status]}
          </Badge>
          {faturamento && (
            <Badge variant="outline">
              Financeiro: {rotuloFinanceiro[faturamento.statusFinanceiro]}
            </Badge>
          )}
          <span className="ml-auto text-sm text-muted-foreground">
            Total{" "}
            <strong className="text-foreground">
              {formatarMoeda(venda.total)}
            </strong>
          </span>
        </div>

        <Tabs defaultValue="itens">
          <TabsList>
            <TabsTrigger value="itens">
              Itens ({venda.items.length})
            </TabsTrigger>
            <TabsTrigger value="parcelas">Parcelas</TabsTrigger>
            <TabsTrigger value="historico">Histórico de status</TabsTrigger>
          </TabsList>

          <TabsContent value="itens" className="pt-3">
            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Unitário</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {venda.items.map((item, indice) => (
                    <TableRow
                      key={`${item.idProduto}-${item.variacao}-${indice}`}
                    >
                      <TableCell>
                        <p className="font-medium">{item.produto}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.codigo}
                          {item.variacao && ` · ${item.variacao}`}
                        </p>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatarQuantidade(item.quantidade, 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatarMoeda(item.unitario)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatarMoeda(item.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <dl className="mt-3 ml-auto w-full max-w-xs space-y-1 text-sm">
              {[
                ["Subtotal", venda.subtotal],
                ["Desconto", venda.desconto],
                ["Frete", venda.frete],
                ["Acréscimo", venda.acrescimo],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="flex justify-between">
                  <dt className="text-muted-foreground">{rotulo}</dt>
                  <dd>{formatarMoeda(valor)}</dd>
                </div>
              ))}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <dt>Total</dt>
                <dd>{formatarMoeda(venda.total)}</dd>
              </div>
            </dl>
          </TabsContent>

          <TabsContent value="parcelas" className="pt-3">
            {erro ? (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            ) : !faturamento ? (
              <Skeleton className="h-32 w-full" />
            ) : faturamento.parcelas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Esta venda ainda não tem parcelas. Elas são geradas quando o
                pedido é fechado com uma condição de pagamento.
              </p>
            ) : (
              <>
                <div className="max-h-72 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Parcela</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead className="text-right">Pago</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {faturamento.parcelas.map((parcela) => (
                        <TableRow key={parcela.numero}>
                          <TableCell>
                            {parcela.numero}/{parcela.total}
                          </TableCell>
                          <TableCell>
                            {formatarDiaIso(parcela.vencimento)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatarMoeda(parcela.valor)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatarMoeda(parcela.pago)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatarMoeda(parcela.saldo)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={variacaoParcela(parcela.situacao)}>
                              {rotuloParcela[parcela.situacao]}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Parcelas: {formatarMoeda(faturamento.resumoParcelas.valor)} ·
                  Recebido: {formatarMoeda(faturamento.resumoParcelas.pago)} · A
                  receber: {formatarMoeda(faturamento.resumoParcelas.saldo)}
                </p>
              </>
            )}
          </TabsContent>

          <TabsContent value="historico" className="pt-3">
            {erro ? (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            ) : !faturamento ? (
              <Skeleton className="h-32 w-full" />
            ) : faturamento.historico.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma mudança de status registrada para esta venda.
              </p>
            ) : (
              <ol className="max-h-72 space-y-3 overflow-auto border-l pl-4">
                {faturamento.historico.map((evento) => (
                  <li key={evento.id} className="relative">
                    <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-primary" />
                    <p className="text-sm font-medium">
                      {descreverMudanca(evento)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatarDataHora(new Date(evento.data))}
                      {evento.usuario && ` · ${evento.usuario}`}
                    </p>
                    {evento.observacao && (
                      <p className="text-sm text-muted-foreground">
                        {evento.observacao}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

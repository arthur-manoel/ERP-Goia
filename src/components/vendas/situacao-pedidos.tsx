"use client"

import { useState } from "react"

import { useErp } from "@/features/erp/components/provedor"
import { consultarDisponibilidade } from "@/features/pedidos/disponibilidade"
import type { Pedido } from "@/features/pedidos/schemas"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * TODO: os status aqui ainda são os do adaptador mock local (Recebido / Em
 * produção / Entregue / Cancelado). O status "oficial" combinado com o back
 * é outro (Rascunho, Confirmada, Em separação, Faturada, Enviada, Entregue,
 * Cancelada — "Em produção" passa a ser só da ordem, não do pedido). Ainda
 * não existe /api/pedidos real, então por enquanto a tela usa o que o
 * adaptador local tem. Quando a API de pedidos existir, trocar os valores
 * abaixo pelos reais.
 */
const statusLabel: Record<Pedido["status"], string> = {
  Recebido: "Recebido",
  "Em produção": "Em produção",
  Entregue: "Entregue",
  Cancelado: "Cancelado",
}

const statusBadgeVariant: Record<
  Pedido["status"],
  "secondary" | "default" | "outline" | "destructive"
> = {
  Recebido: "outline",
  "Em produção": "default",
  Entregue: "secondary",
  Cancelado: "destructive",
}

const situacaoInfo = {
  estoque: { label: "Coberto por estoque", variant: "secondary" as const },
  producao: { label: "Coberto por produção", variant: "default" as const },
  insuficiente: { label: "Insuficiente", variant: "destructive" as const },
}

export function SituacaoPedidos() {
  const { data, error, reload } = useErp()

  const [busca, setBusca] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("todos")

  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível carregar os dados</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          {error}
          <Button variant="outline" onClick={() => void reload()}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    )

  if (!data)
    return (
      <div role="status" aria-label="Carregando dados">
        <Skeleton className="h-96 w-full" />
      </div>
    )

  const cliente = (id: string) =>
    data.clients.find((row) => row.id === id)?.name ?? "Cadastro não encontrado"

  const produto = (id: string) => data.materials.find((row) => row.id === id)

  const nomeItem = (productId: string, variationId?: string) => {
    const material = produto(productId)
    if (!material) return "Produto não encontrado"
    if (!variationId) return material.name
    const variacao = material.variations?.find((v) => v.id === variationId)
    return variacao
      ? `${material.name} — ${variacao.color} / ${variacao.size}`
      : material.name
  }

  // Ordens cuja grade cobre o produto+variação do item e que ainda estão
  // ativas (mesmo critério usado dentro de consultarDisponibilidade).
  const ordensVinculadas = (
    productId: string,
    variationId: string | undefined,
    prazo: string,
  ) =>
    data.productions.filter(
      (ordem) =>
        ordem.productId === productId &&
        ["Planejada", "Em produção"].includes(ordem.status) &&
        ordem.dueDate <= prazo &&
        ordem.items.some(
          (linha) => (linha.variationId ?? "") === (variationId ?? ""),
        ),
    )

  type Linha = {
    pedido: Pedido
    productId: string
    variationId?: string
    quantity: number
    situacao: "estoque" | "producao" | "insuficiente"
    ordens: ReturnType<typeof ordensVinculadas>
  }

  const linhas: Linha[] = data.orders.flatMap((pedido) =>
    pedido.items.flatMap((item) => {
      const disponibilidade = consultarDisponibilidade(
        data,
        item,
        pedido.dueDate,
        pedido.id,
      )
      if (!disponibilidade) return []
      return [
        {
          pedido,
          productId: item.productId,
          variationId: item.variationId,
          quantity: item.quantity,
          situacao: disponibilidade.situacao,
          ordens: ordensVinculadas(
            item.productId,
            item.variationId,
            pedido.dueDate,
          ),
        },
      ]
    }),
  )

  const linhasFiltradas = linhas.filter((linha) => {
    const combinaBusca =
      linha.pedido.code.toLowerCase().includes(busca.toLowerCase()) ||
      cliente(linha.pedido.clientId).toLowerCase().includes(busca.toLowerCase())
    const combinaStatus =
      filtroStatus === "todos" || linha.pedido.status === filtroStatus
    return combinaBusca && combinaStatus
  })

  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <AlertTitle>Status provisórios</AlertTitle>
        <AlertDescription>
          Os status abaixo (Recebido/Em produção/Entregue/Cancelado) ainda são
          os do protótipo local — ainda não existe uma API real de pedidos.
          Quando existir, os nomes oficiais combinados com o back são outros
          (Rascunho, Confirmada, Em separação, Faturada, Enviada, Entregue,
          Cancelada).
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar por pedido ou cliente..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={filtroStatus}
          onValueChange={(v) => setFiltroStatus(v ?? "todos")}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.keys(statusLabel).map((status) => (
              <SelectItem key={status} value={status}>
                {statusLabel[status as Pedido["status"]]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Situação dos pedidos</CardTitle>
          <CardDescription>
            Acompanhamento de cada item do pedido até a entrega, com a cobertura
            de estoque/produção e as ordens vinculadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead>Status do pedido</TableHead>
                  <TableHead>Cobertura</TableHead>
                  <TableHead>Ordem vinculada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhasFiltradas.length ? (
                  linhasFiltradas.map((linha, index) => (
                    <TableRow key={`${linha.pedido.id}-${index}`}>
                      <TableCell className="font-medium">
                        {linha.pedido.code}
                      </TableCell>
                      <TableCell>{cliente(linha.pedido.clientId)}</TableCell>
                      <TableCell>
                        {nomeItem(linha.productId, linha.variationId)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {linha.quantity}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={statusBadgeVariant[linha.pedido.status]}
                        >
                          {statusLabel[linha.pedido.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={situacaoInfo[linha.situacao].variant}>
                          {situacaoInfo[linha.situacao].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {linha.ordens.length ? (
                          <div className="flex flex-wrap gap-1">
                            {linha.ordens.map((ordem) => (
                              <Badge key={ordem.id} variant="outline">
                                {ordem.code}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>Nenhum pedido encontrado.</EmptyTitle>
                          <EmptyDescription>
                            Altere os filtros ou cadastre pedidos em Vendas.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

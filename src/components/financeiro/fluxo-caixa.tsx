"use client"

import { useState } from "react"
import { TriangleAlert } from "lucide-react"

import { useErp } from "@/features/erp/components/provedor"
import { hoje as today } from "@/features/erp/datas"

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
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function brl(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function primeiroDiaDoMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export function FluxoCaixa() {
  const { data, error, reload } = useErp()

  const [de, setDe] = useState(primeiroDiaDoMes())
  const [ate, setAte] = useState(today())

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
      <div role="status" aria-label="Carregando dados" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )

  const client = (id: string) =>
    data.clients.find((row) => row.id === id)?.name ?? "Cadastro não encontrado"

  const dentroDoPeriodo = data.transactions.filter(
    (row) => row.dueDate >= de && row.dueDate <= ate,
  )

  const entradas = dentroDoPeriodo
    .filter((row) => row.type === "Receber")
    .reduce((soma, row) => soma + row.amount, 0)

  const saidas = dentroDoPeriodo
    .filter((row) => row.type === "Pagar")
    .reduce((soma, row) => soma + row.amount, 0)

  const saldoDoPeriodo = entradas - saidas

  // Saldo projetado: tudo que está em aberto com vencimento até a data final
  // escolhida (inclui atrasados e futuros dentro do período).
  const emAbertoAteData = data.transactions.filter(
    (row) => row.status === "Em aberto" && row.dueDate <= ate,
  )
  const saldoProjetado = emAbertoAteData.reduce(
    (soma, row) => soma + (row.type === "Receber" ? row.amount : -row.amount),
    0,
  )

  const emAtraso = data.transactions.filter(
    (row) => row.status === "Em aberto" && row.dueDate < today(),
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="De"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            className="w-[160px]"
          />
          <span className="text-sm text-muted-foreground">até</span>
          <Input
            type="date"
            aria-label="Até"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="w-[160px]"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Entradas no período
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {brl(entradas)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saídas no período
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {brl(saidas)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saldo do período
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {brl(saldoDoPeriodo)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Saldo projetado até{" "}
              {new Date(ate + "T00:00:00").toLocaleDateString("pt-BR")}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {brl(saldoProjetado)}
          </CardContent>
        </Card>
      </div>

      {emAtraso.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>
            {emAtraso.length} conta{emAtraso.length > 1 ? "s" : ""} em atraso
          </AlertTitle>
          <AlertDescription>
            Some no total {brl(emAtraso.reduce((s, r) => s + r.amount, 0))} em
            lançamentos vencidos e ainda não liquidados.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Movimentações no período</CardTitle>
          <CardDescription>
            Entradas e saídas com vencimento entre as datas selecionadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Cliente / Fornecedor</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dentroDoPeriodo.length ? (
                  dentroDoPeriodo.map((row) => {
                    const vencido =
                      row.status === "Em aberto" && row.dueDate < today()
                    const situacao = vencido ? "Vencido" : row.status
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.description}
                        </TableCell>
                        <TableCell>{client(row.partyId)}</TableCell>
                        <TableCell>
                          {row.type === "Pagar" ? "A pagar" : "A receber"}
                        </TableCell>
                        <TableCell>
                          {new Date(
                            row.dueDate + "T00:00:00",
                          ).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {brl(row.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={vencido ? "destructive" : "outline"}>
                            {situacao}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>
                            Nenhuma movimentação no período.
                          </EmptyTitle>
                          <EmptyDescription>
                            Altere as datas ou cadastre lançamentos em
                            Financeiro.
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

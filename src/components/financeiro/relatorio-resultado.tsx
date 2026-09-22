"use client"

import { useState } from "react"
import { Info } from "lucide-react"

import { useErp } from "@/features/erp/components/provedor"

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

/**
 * TODO (bloqueado no schema): `Lancamento` só distingue type "Pagar"/"Receber",
 * sem nenhuma categoria que separe custo de insumos de despesas gerais dentro
 * do que é pago. Por isso o relatório abaixo mostra "Saídas" como um total
 * único. Quando o schema (features/financeiro/schemas.ts) ganhar um campo de
 * categoria, dividir esse total em "Custo de insumos" e "Despesas".
 */

function brl(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function primeiroDiaDoMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function hojeLocal() {
  return new Date().toLocaleDateString("sv-SE")
}

export function RelatorioResultado() {
  const { data, error, reload } = useErp()

  const [de, setDe] = useState(primeiroDiaDoMes())
  const [ate, setAte] = useState(hojeLocal())

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
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )

  const client = (id: string) =>
    data.clients.find((row) => row.id === id)?.name ?? "Cadastro não encontrado"

  const periodoValido = Boolean(de) && Boolean(ate) && de <= ate

  const noPeriodo = periodoValido
    ? data.transactions.filter((row) => row.dueDate >= de && row.dueDate <= ate)
    : []

  const receita = noPeriodo
    .filter((row) => row.type === "Receber")
    .reduce((soma, row) => soma + row.amount, 0)

  const saidas = noPeriodo
    .filter((row) => row.type === "Pagar")
    .reduce((soma, row) => soma + row.amount, 0)

  const margem = receita - saidas
  const margemPercentual = receita > 0 ? (margem / receita) * 100 : 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="De"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            aria-invalid={!periodoValido}
            className="w-[160px]"
          />
          <span className="text-sm text-muted-foreground">até</span>
          <Input
            type="date"
            aria-label="Até"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            aria-invalid={!periodoValido}
            className="w-[160px]"
          />
        </div>
        {!periodoValido && (
          <span className="text-sm text-destructive">
            {!de || !ate
              ? "Preencha as duas datas do período."
              : 'A data "De" não pode ser depois da data "Até".'}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Receita
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {brl(receita)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              Saídas (insumos + despesas)
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {brl(saidas)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Margem apurada
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums">
              {brl(margem)}
            </span>
            <Badge variant={margem >= 0 ? "secondary" : "destructive"}>
              {margemPercentual.toFixed(1)}%
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Alert>
        <Info aria-hidden />
        <AlertTitle>Saídas ainda não são separadas por categoria</AlertTitle>
        <AlertDescription>
          Os lançamentos &quot;a pagar&quot; hoje não distinguem custo de
          insumos de despesas gerais — o valor acima é o total das duas coisas
          juntas.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos considerados no período</CardTitle>
          <CardDescription>
            Todos os lançamentos com vencimento entre as datas selecionadas.
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {noPeriodo.length ? (
                  noPeriodo.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        {row.description}
                      </TableCell>
                      <TableCell>{client(row.partyId)}</TableCell>
                      <TableCell>
                        {row.type === "Pagar" ? "Saída" : "Receita"}
                      </TableCell>
                      <TableCell>
                        {new Date(row.dueDate + "T00:00:00").toLocaleDateString(
                          "pt-BR",
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.type === "Pagar" ? "-" : ""}
                        {brl(row.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>
                            {periodoValido
                              ? "Nenhum lançamento no período."
                              : "Selecione um período válido."}
                          </EmptyTitle>
                          <EmptyDescription>
                            {periodoValido
                              ? "Altere as datas ou cadastre lançamentos em Financeiro."
                              : 'Preencha as duas datas, com "De" antes ou igual a "Até".'}
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

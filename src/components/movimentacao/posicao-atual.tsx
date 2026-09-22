"use client"

import { useState } from "react"

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
 * TODO (bloqueado no banco): a tabela `estoque` guarda quantidade por
 * id_produto + id_local_estoque + id_setor, sem referência a
 * `produto_variacoes` (id_cor/id_tamanho) — ou seja, hoje não existe saldo
 * por variação, só por produto inteiro. A coluna "Variação" abaixo já está
 * reservada no layout; quando o schema passar a rastreirar saldo por
 * variação (ex.: `estoque.id_produto_variacao`), trocar o Badge "Pendente"
 * pela quantidade real de cada variação.
 */
export function PosicaoAtual() {
  const { data, error, reload } = useErp()
  const [busca, setBusca] = useState("")

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
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )

  const materiaisFiltrados = data.materials.filter((row) =>
    row.name.toLowerCase().includes(busca.toLowerCase()),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Posição atual</CardTitle>
        <CardDescription>
          Saldo por produto. A coluna Variação ainda depende de um ajuste no
          banco — veja a observação abaixo da tabela.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Input
          placeholder="Buscar por produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Variação</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materiaisFiltrados.length ? (
                materiaisFiltrados.map((row) => {
                  const situacao =
                    row.quantity === 0
                      ? "Sem estoque"
                      : row.quantity <= row.minimum
                        ? "Estoque baixo"
                        : "Disponível"
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.category}</TableCell>
                      <TableCell>
                        <Badge variant="outline">Pendente</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.quantity} {row.unit}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            situacao === "Sem estoque"
                              ? "destructive"
                              : situacao === "Estoque baixo"
                                ? "default"
                                : "secondary"
                          }
                        >
                          {situacao}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>Nenhum produto encontrado.</EmptyTitle>
                        <EmptyDescription>
                          Cadastre materiais em Estoque para vê-los aqui.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-sm text-muted-foreground">
          A coluna <strong>Variação</strong> está reservada no layout, mas o
          banco ainda não rastreia saldo por cor/tamanho — só por produto. Assim
          que isso for ajustado, esta tela passa a mostrar a quantidade real de
          cada variação.
        </p>
      </CardContent>
    </Card>
  )
}

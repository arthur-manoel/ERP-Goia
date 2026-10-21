"use client"

import { useState } from "react"
import { Download } from "lucide-react"

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  rotuloTipo,
  TIPOS_MOVIMENTACAO,
  type ItemMovimentavel,
  type TipoMovimentacao,
} from "@/lib/movimentacao/tipos"

// TODO: hoje nenhuma movimentação é gravada de verdade (ver aviso em
// MovimentacaoTela: "nenhuma movimentação é gravada"). Quando a gravação
// existir (registro.ts deixar de ser mock), trocar por uma consulta real,
// filtrada pela empresa da sessão.
type RegistroHistorico = {
  id: string
  data: string // aaaa-mm-dd
  idItem: number
  tipo: TipoMovimentacao
  quantidade: string
  observacao: string | null
}

const HISTORICO: RegistroHistorico[] = []

const badgeVariant: Record<
  TipoMovimentacao,
  "secondary" | "outline" | "default"
> = {
  entrada: "secondary",
  saida: "outline",
  transferencia: "default",
}

export function HistoricoMovimentacoes({
  itens,
}: {
  itens: ItemMovimentavel[]
}) {
  const [busca, setBusca] = useState("")
  const [idItem, setIdItem] = useState("todos")
  const [tipo, setTipo] = useState("todos")
  const [de, setDe] = useState("")
  const [ate, setAte] = useState("")

  const nomeItem = (id: number) =>
    itens.find((item) => item.id === id)?.nome ?? "Item não encontrado"

  const historicoFiltrado = HISTORICO.filter((registro) => {
    const combinaBusca = nomeItem(registro.idItem)
      .toLowerCase()
      .includes(busca.toLowerCase())
    const combinaItem = idItem === "todos" || registro.idItem === Number(idItem)
    const combinaTipo = tipo === "todos" || registro.tipo === tipo
    const combinaPeriodo =
      (!de || registro.data >= de) && (!ate || registro.data <= ate)
    return combinaBusca && combinaItem && combinaTipo && combinaPeriodo
  })

  function handleExportar() {
    // TODO: gerar CSV/PDF a partir de `historicoFiltrado` (ou chamar uma
    // rota de API) quando houver movimentações reais gravadas.
    console.log("Exportar", historicoFiltrado)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>Histórico de movimentação</CardTitle>
          <CardDescription>
            Entradas, saídas e transferências por período, para conferência.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          onClick={handleExportar}
          disabled={historicoFiltrado.length === 0}
        >
          <Download />
          Exportar
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Buscar por item..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-xs"
          />
          <Select
            value={idItem}
            onValueChange={(value) => setIdItem(value ?? "todos")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Item" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os itens</SelectItem>
              {itens.map((item) => (
                <SelectItem key={item.id} value={String(item.id)}>
                  {item.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={tipo}
            onValueChange={(value) => setTipo(value ?? "todos")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              {TIPOS_MOVIMENTACAO.map((t) => (
                <SelectItem key={t} value={t}>
                  {rotuloTipo[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead>Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historicoFiltrado.length ? (
                historicoFiltrado.map((registro) => (
                  <TableRow key={registro.id}>
                    <TableCell>{registro.data}</TableCell>
                    <TableCell className="font-medium">
                      {nomeItem(registro.idItem)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badgeVariant[registro.tipo]}>
                        {rotuloTipo[registro.tipo]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {registro.quantidade}
                    </TableCell>
                    <TableCell>{registro.observacao ?? "—"}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center">
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>
                          Nenhuma movimentação encontrada.
                        </EmptyTitle>
                        <EmptyDescription>
                          Ainda não há movimentações registradas, ou nenhuma
                          bate com os filtros.
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
  )
}

"use client"

import * as React from "react"
import { Download } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Badge } from "@/components/ui/badge"

// TODO: substituir pelos dados reais vindos do Prisma (models `estoque`,
// `produtos`, `produto_variacoes` e `movimentacao_estoque`).
// Esse mock só serve para validar o layout enquanto a API não existe.
type PosicaoEstoque = {
  id: number
  produto: string
  variacao: string // ex: "Azul / M"
  localEstoque: string
  quantidade: number
  quantidadeReservada: number
  unidade: string
  situacao: "normal" | "baixo" | "zerado"
}

type Movimentacao = {
  id: number
  data: string
  produto: string
  tipo: "entrada" | "saida"
  quantidade: number
  origem: string
}

const POSICAO_MOCK: PosicaoEstoque[] = [
  {
    id: 1,
    produto: "Camiseta Básica",
    variacao: "Azul / M",
    localEstoque: "Depósito Central",
    quantidade: 120,
    quantidadeReservada: 15,
    unidade: "UN",
    situacao: "normal",
  },
  {
    id: 2,
    produto: "Camiseta Básica",
    variacao: "Preto / G",
    localEstoque: "Depósito Central",
    quantidade: 8,
    quantidadeReservada: 2,
    unidade: "UN",
    situacao: "baixo",
  },
  {
    id: 3,
    produto: "Tecido Algodão",
    variacao: "—",
    localEstoque: "Setor Produção",
    quantidade: 0,
    quantidadeReservada: 0,
    unidade: "M",
    situacao: "zerado",
  },
]

const MOVIMENTACAO_MOCK: Movimentacao[] = [
  {
    id: 1,
    data: "18/09/2026",
    produto: "Camiseta Básica (Azul / M)",
    tipo: "entrada",
    quantidade: 50,
    origem: "Compra #1023",
  },
  {
    id: 2,
    data: "17/09/2026",
    produto: "Camiseta Básica (Preto / G)",
    tipo: "saida",
    quantidade: 12,
    origem: "Venda #884",
  },
  {
    id: 3,
    data: "15/09/2026",
    produto: "Tecido Algodão",
    tipo: "saida",
    quantidade: 30,
    origem: "Ordem de Produção #212",
  },
]

const situacaoLabel: Record<PosicaoEstoque["situacao"], string> = {
  normal: "Normal",
  baixo: "Estoque baixo",
  zerado: "Zerado",
}

const situacaoVariant: Record<
  PosicaoEstoque["situacao"],
  "default" | "secondary" | "destructive"
> = {
  normal: "secondary",
  baixo: "default",
  zerado: "destructive",
}

/** Botão de exportar, usado no slot `acoes` do PageHeader (renderizado pelo page.tsx). */
export function ExportarPosicaoEstoqueButton() {
  function handleExportar() {
    // TODO: gerar CSV/PDF a partir da posição filtrada (ou chamar uma rota
    // de API que gera o arquivo no servidor).
    console.log("Exportar")
  }

  return (
    <Button onClick={handleExportar}>
      <Download />
      Exportar para conferência
    </Button>
  )
}

export function PosicaoEstoque() {
  const [busca, setBusca] = React.useState("")
  const [local, setLocal] = React.useState<string>("todos")

  const posicaoFiltrada = POSICAO_MOCK.filter((item) => {
    const combinaBusca = item.produto
      .toLowerCase()
      .includes(busca.toLowerCase())
    const combinaLocal = local === "todos" || item.localEstoque === local
    return combinaBusca && combinaLocal
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Buscar produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <Select
          value={local}
          onValueChange={(value) => setLocal(value ?? "todos")}
        >
          <SelectTrigger>
            <SelectValue placeholder="Local de estoque" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os locais</SelectItem>
            <SelectItem value="Depósito Central">Depósito Central</SelectItem>
            <SelectItem value="Setor Produção">Setor Produção</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Posição atual</CardTitle>
          <CardDescription>
            Quantidade disponível por insumo e variação, considerando reservas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>Variação</TableHead>
                <TableHead>Local</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">Reservado</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posicaoFiltrada.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.produto}</TableCell>
                  <TableCell>{item.variacao}</TableCell>
                  <TableCell>{item.localEstoque}</TableCell>
                  <TableCell className="text-right">
                    {item.quantidade} {item.unidade}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.quantidadeReservada} {item.unidade}
                  </TableCell>
                  <TableCell>
                    <Badge variant={situacaoVariant[item.situacao]}>
                      {situacaoLabel[item.situacao]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {posicaoFiltrada.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    Nenhum item encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de movimentação</CardTitle>
          <CardDescription>
            Últimas entradas e saídas registradas no período.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead>Origem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MOVIMENTACAO_MOCK.map((mov) => (
                <TableRow key={mov.id}>
                  <TableCell>{mov.data}</TableCell>
                  <TableCell>{mov.produto}</TableCell>
                  <TableCell>
                    <Badge
                      variant={mov.tipo === "entrada" ? "secondary" : "outline"}
                    >
                      {mov.tipo === "entrada" ? "Entrada" : "Saída"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{mov.quantidade}</TableCell>
                  <TableCell>{mov.origem}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

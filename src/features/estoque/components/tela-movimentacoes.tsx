"use client"

import { useState } from "react"
import { Download, Search } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { useErp } from "@/features/erp/components/provedor"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { rotuloData as dateLabel, hoje as today } from "@/features/erp/datas"
import { formatarQuantidade } from "@/lib/formatacao"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

// TODO: substituir por uma coleção real (`movements`) no adaptador/ErpProvider
// quando o backend (tabela `movimentacao_estoque`) estiver disponível.
// Enquanto isso, o histórico começa vazio — não inventamos dados fictícios.
type TipoMovimentacao = "Entrada" | "Saída"

type Movimentacao = {
  id: string
  data: string // aaaa-mm-dd
  produtoId: string
  tipo: TipoMovimentacao
  quantidade: number
  origem: string
}

const MOVIMENTACOES: Movimentacao[] = []

export function TelaMovimentacoes() {
  const { data, error, reload } = useErp()

  const [busca, setBusca] = useState("")
  const [produtoId, setProdutoId] = useState("")
  const [tipo, setTipo] = useState("")
  const [de, setDe] = useState("")
  const [ate, setAte] = useState(today())

  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível carregar os dados</AlertTitle>
        <AlertDescription>
          {error}
          <Button variant="outline" onClick={() => void reload()}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    )

  if (!data)
    return (
      <div role="status" aria-label="Carregando dados" className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )

  const produto = (id: string) =>
    data.materials.find((row) => row.id === id)?.name ??
    "Produto não encontrado"

  const produtoOptions = data.materials.map((row) => ({
    value: row.id,
    label: row.name,
  }))

  const movimentacoesFiltradas = MOVIMENTACOES.filter((mov) => {
    const combinaBusca = produto(mov.produtoId)
      .toLowerCase()
      .includes(busca.toLowerCase())
    const combinaProduto = !produtoId || mov.produtoId === produtoId
    const combinaTipo = !tipo || mov.tipo === tipo
    const combinaPeriodo = (!de || mov.data >= de) && (!ate || mov.data <= ate)
    return combinaBusca && combinaProduto && combinaTipo && combinaPeriodo
  })

  const filtrosAtivos = Boolean(busca || produtoId || tipo || de)

  function limparFiltros() {
    setBusca("")
    setProdutoId("")
    setTipo("")
    setDe("")
  }

  function handleExportar() {
    // TODO: gerar CSV/PDF a partir de `movimentacoesFiltradas` (ou chamar uma
    // rota de API que gera o arquivo no servidor) quando houver dados reais.
    console.log("Exportar", movimentacoesFiltradas)
  }

  return (
    <>
      <PageHeader
        titulo="Movimentações de estoque"
        descricao="Entradas e saídas por período, para conferência do saldo."
        acoes={
          <Button
            variant="outline"
            onClick={handleExportar}
            disabled={movimentacoesFiltradas.length === 0}
          >
            <Download />
            Exportar para conferência
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            aria-label="Buscar por produto"
            className="pl-9"
            placeholder="Buscar por produto..."
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>
        <SearchSelect
          value={produtoId}
          onValueChange={setProdutoId}
          label="Filtrar por produto"
          placeholder="Todos os produtos"
          className="w-full sm:w-[220px]"
          options={produtoOptions}
        />
        <SearchSelect
          value={tipo}
          onValueChange={setTipo}
          label="Filtrar por tipo"
          placeholder="Todos os tipos"
          className="w-full sm:w-[180px]"
          options={[
            { value: "Entrada", label: "Entrada" },
            { value: "Saída", label: "Saída" },
          ]}
        />
        <div className="flex items-center gap-2">
          <Input
            type="date"
            aria-label="De"
            value={de}
            onChange={(event) => setDe(event.target.value)}
            className="w-[160px]"
          />
          <span className="text-sm text-muted-foreground">até</span>
          <Input
            type="date"
            aria-label="Até"
            value={ate}
            onChange={(event) => setAte(event.target.value)}
            className="w-[160px]"
          />
        </div>
        {filtrosAtivos && (
          <Button variant="ghost" onClick={limparFiltros}>
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-md border">
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
            {movimentacoesFiltradas.length ? (
              movimentacoesFiltradas.map((mov) => (
                <TableRow key={mov.id}>
                  <TableCell>{dateLabel(mov.data)}</TableCell>
                  <TableCell className="font-medium">
                    {produto(mov.produtoId)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={mov.tipo === "Entrada" ? "secondary" : "outline"}
                    >
                      {mov.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarQuantidade(mov.quantidade)}
                  </TableCell>
                  <TableCell>{mov.origem}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center">
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>Nenhuma movimentação encontrada.</EmptyTitle>
                      <EmptyDescription>
                        Altere os filtros ou aguarde novas entradas e saídas
                        serem registradas.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

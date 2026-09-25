"use client"

import { ArrowDown, ArrowUp, PackageSearch } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatarMoeda, formatarQuantidade } from "@/lib/formatacao"
import type { StatusProduto } from "../constantes"

type Numerico = number | string | { toString(): string }

export type ProdutoTabela = {
  id: number
  status: StatusProduto
  preco_venda: Numerico
  estoque_atual: Numerico
  produtos: {
    codigo: string
    nome: string
    unidade: string
    categorias: { nome: string } | null
    tipos_produto: { nome: string }
  }
}

export type OrdenacaoCodigo = "asc" | "desc"

type TabelaProdutosProps = {
  produtos: ProdutoTabela[]
  total: number
  ordenacao: OrdenacaoCodigo
  onOrdenacaoChange: () => void
}

function BadgeStatus({ status }: { status: StatusProduto }) {
  return (
    <Badge variant={status === "ATIVO" ? "secondary" : "outline"}>
      {status}
    </Badge>
  )
}

export function TabelaProdutos({
  produtos,
  total,
  ordenacao,
  onOrdenacaoChange,
}: TabelaProdutosProps) {
  const IconeOrdenacao = ordenacao === "asc" ? ArrowUp : ArrowDown

  return (
    <div className="space-y-4">
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                aria-sort={ordenacao === "asc" ? "ascending" : "descending"}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2"
                  onClick={onOrdenacaoChange}
                >
                  Código
                  <IconeOrdenacao data-icon="inline-end" />
                </Button>
              </TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead className="text-right">Preço de venda</TableHead>
              <TableHead className="text-right">Estoque atual</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {produtos.map((produtoEmpresa) => (
              <TableRow key={produtoEmpresa.id}>
                <TableCell className="font-mono text-xs">
                  {produtoEmpresa.produtos.codigo}
                </TableCell>
                <TableCell className="font-medium">
                  {produtoEmpresa.produtos.nome}
                </TableCell>
                <TableCell>
                  {produtoEmpresa.produtos.tipos_produto.nome}
                </TableCell>
                <TableCell>
                  {produtoEmpresa.produtos.categorias?.nome ?? "—"}
                </TableCell>
                <TableCell>{produtoEmpresa.produtos.unidade}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatarMoeda(produtoEmpresa.preco_venda)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatarQuantidade(produtoEmpresa.estoque_atual)}
                </TableCell>
                <TableCell>
                  <BadgeStatus status={produtoEmpresa.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">—</TableCell>
              </TableRow>
            ))}
            {produtos.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="p-0 whitespace-normal">
                  <Empty className="min-h-64 rounded-none border-0">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <PackageSearch />
                      </EmptyMedia>
                      <EmptyTitle>Nenhum produto encontrado.</EmptyTitle>
                      <EmptyDescription>
                        Altere os filtros ou cadastre um novo produto.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{total} produtos</p>
        <Pagination aria-label="Paginação de produtos" className="mx-0 w-auto">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                text="Anterior"
                aria-disabled="true"
                className="pointer-events-none opacity-50"
              />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink isActive aria-disabled="true">
                1
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                text="Próxima"
                aria-disabled="true"
                className="pointer-events-none opacity-50"
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}

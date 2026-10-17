import { ArrowUpDown, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatarMoeda, formatarQuantidade } from "@/lib/formatacao"
import {
  situacaoProduto,
  totalSaldo,
  type ProdutoPronto,
  type SituacaoProduto,
} from "../schemas"

type Props = {
  produtos: ProdutoPronto[]
  crescente: boolean
  onAlternarOrdem: () => void
  onEditar: (produto: ProdutoPronto) => void
  onVisualizarGrade: (produto: ProdutoPronto) => void
  onExcluir: (produto: ProdutoPronto) => void
}

function BadgeSituacao({ situacao }: { situacao: SituacaoProduto }) {
  if (situacao === "Sem estoque") {
    return <Badge variant="destructive">Sem estoque</Badge>
  }

  if (situacao === "Estoque baixo") {
    return <Badge variant="secondary">Estoque baixo</Badge>
  }

  return <Badge variant="outline">Disponível</Badge>
}

export function TabelaProdutosProntos({
  produtos,
  crescente,
  onAlternarOrdem,
  onEditar,
  onVisualizarGrade,
  onExcluir,
}: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead aria-sort={crescente ? "ascending" : "descending"}>
              <Button
                variant="ghost"
                className="-ml-3"
                onClick={onAlternarOrdem}
              >
                Código <ArrowUpDown />
              </Button>
            </TableHead>
            <TableHead>Produto</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">Variações</TableHead>
            <TableHead className="text-right">Saldo total</TableHead>
            <TableHead className="text-right">Preço de custo</TableHead>
            <TableHead className="text-right">Margem</TableHead>
            <TableHead className="text-right">Preço de venda</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {produtos.map((produto) => {
            const situacao = situacaoProduto(produto)
            return (
              <TableRow key={produto.id}>
                <TableCell className="font-mono text-xs font-medium tabular-nums">
                  {produto.sku}
                </TableCell>
                <TableCell className="min-w-48 font-medium">
                  {produto.nome}
                </TableCell>
                <TableCell>{produto.categoria}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {produto.variacoes.length}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatarQuantidade(totalSaldo(produto), 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatarMoeda(produto.precoCusto)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {produto.margemLucro.toLocaleString("pt-BR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  %
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatarMoeda(produto.precoVenda)}
                </TableCell>
                <TableCell>
                  <BadgeSituacao situacao={situacao} />
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Ações de ${produto.nome}`}
                        />
                      }
                    >
                      <MoreHorizontal />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => onEditar(produto)}>
                          <Pencil /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onVisualizarGrade(produto)}
                        >
                          <Eye /> Visualizar matriz de grade
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => onExcluir(produto)}
                        >
                          <Trash2 /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

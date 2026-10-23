import { GitBranch, Pencil, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { Produto, TipoProduto } from "../tipos"

export function TabelaProdutosProntos({
  produtos,
  tipos,
  onEditar,
  onFluxo,
  onInativar,
}: {
  produtos: Produto[]
  tipos: TipoProduto[]
  onEditar: (produto: Produto) => void
  onFluxo: (produto: Produto) => void
  onInativar: (produto: Produto) => void
}) {
  const nomesTipos = new Map(tipos.map((tipo) => [tipo.id, tipo.nome]))
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Código</TableHead>
            <TableHead>Produto</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Unidade</TableHead>
            <TableHead>Operações</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <span className="sr-only">Ações</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {produtos.map((produto) => (
            <TableRow key={produto.id}>
              <TableCell className="font-mono text-xs">
                {produto.codigo}
              </TableCell>
              <TableCell className="font-medium">{produto.nome}</TableCell>
              <TableCell>
                {nomesTipos.get(produto.id_tipo_produto) ??
                  `Tipo #${produto.id_tipo_produto}`}
              </TableCell>
              <TableCell>{produto.unidade}</TableCell>
              <TableCell className="text-sm">
                {[
                  produto.controla_estoque && "Estoque",
                  produto.permite_compra && "Compra",
                  produto.permite_producao && "Produção",
                  produto.permite_venda && "Venda",
                ]
                  .filter(Boolean)
                  .join(", ") || "Nenhuma"}
              </TableCell>
              <TableCell>
                <Badge
                  variant={produto.status === "ATIVO" ? "outline" : "secondary"}
                >
                  {produto.status === "ATIVO" ? "Ativo" : "Inativo"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Fluxo de ${produto.nome}`}
                    onClick={() => onFluxo(produto)}
                  >
                    <GitBranch className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${produto.nome}`}
                    onClick={() => onEditar(produto)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {produto.status === "ATIVO" && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Inativar ${produto.nome}`}
                      onClick={() => onInativar(produto)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

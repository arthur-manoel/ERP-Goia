import { PackageSearch } from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
  PaginationEllipsis,
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
import {
  type ResultadoProdutos,
  type StatusProduto,
  ITENS_POR_PAGINA,
} from "../queries"

type TabelaProdutosProps = ResultadoProdutos & {
  busca?: string
  status?: StatusProduto
}

type ProdutoDaGrade = ResultadoProdutos["produtos"][number]

type ParametrosPaginacao = {
  busca?: string
  status?: StatusProduto
  pagina: number
}

type ItemPaginacao = number | "reticencias"

function criarPaginasVisiveis(totalPaginas: number, paginaAtual: number) {
  const paginas = new Set([
    1,
    totalPaginas,
    paginaAtual - 1,
    paginaAtual,
    paginaAtual + 1,
  ])
  const ordenadas = [...paginas]
    .filter((pagina) => pagina >= 1 && pagina <= totalPaginas)
    .sort((a, b) => a - b)

  return ordenadas.reduce<ItemPaginacao[]>((resultado, pagina) => {
    const ultimaPagina = resultado.at(-1)
    if (typeof ultimaPagina === "number" && pagina - ultimaPagina > 1) {
      resultado.push("reticencias")
    }
    resultado.push(pagina)
    return resultado
  }, [])
}

function criarHrefPagina({ busca, status, pagina }: ParametrosPaginacao) {
  const parametros = new URLSearchParams()
  if (busca) parametros.set("busca", busca)
  if (status) parametros.set("status", status)
  if (pagina > 1) parametros.set("pagina", String(pagina))

  const query = parametros.toString()
  return query ? `/produtos?${query}` : "/produtos"
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
  pagina,
  totalPaginas,
  busca,
  status,
}: TabelaProdutosProps) {
  if (produtos.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageSearch />
          </EmptyMedia>
          <EmptyTitle>Nenhum produto encontrado</EmptyTitle>
          <EmptyDescription>
            Ajuste a busca ou os filtros para encontrar produtos vinculados à
            empresa.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const primeiroItem = (pagina - 1) * ITENS_POR_PAGINA + 1
  const ultimoItem = primeiroItem + produtos.length - 1
  const paginasVisiveis = criarPaginasVisiveis(totalPaginas, pagina)

  return (
    <div className="space-y-4">
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead className="text-right">Preço de venda</TableHead>
              <TableHead className="text-right">Estoque atual</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {produtos.map((produtoEmpresa: ProdutoDaGrade) => (
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
                <TableCell className="text-right">
                  {formatarMoeda(produtoEmpresa.preco_venda)}
                </TableCell>
                <TableCell className="text-right">
                  {formatarQuantidade(produtoEmpresa.estoque_atual)}
                </TableCell>
                <TableCell>
                  <BadgeStatus status={produtoEmpresa.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Exibindo {primeiroItem}–{ultimoItem} de {total} produto
          {total === 1 ? "" : "s"}
        </p>
        {totalPaginas > 1 && (
          <Pagination
            aria-label="Paginação de produtos"
            className="mx-0 w-auto"
          >
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  text="Anterior"
                  href={criarHrefPagina({ busca, status, pagina: pagina - 1 })}
                  aria-disabled={pagina === 1}
                  className={
                    pagina === 1 ? "pointer-events-none opacity-50" : undefined
                  }
                />
              </PaginationItem>
              {paginasVisiveis.map((paginaVisivel, indice) => (
                <PaginationItem key={`${paginaVisivel}-${indice}`}>
                  {paginaVisivel === "reticencias" ? (
                    <PaginationEllipsis />
                  ) : (
                    <PaginationLink
                      href={criarHrefPagina({
                        busca,
                        status,
                        pagina: paginaVisivel,
                      })}
                      isActive={paginaVisivel === pagina}
                    >
                      {paginaVisivel}
                    </PaginationLink>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  text="Próxima"
                  href={criarHrefPagina({ busca, status, pagina: pagina + 1 })}
                  aria-disabled={pagina === totalPaginas}
                  className={
                    pagina === totalPaginas
                      ? "pointer-events-none opacity-50"
                      : undefined
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  )
}

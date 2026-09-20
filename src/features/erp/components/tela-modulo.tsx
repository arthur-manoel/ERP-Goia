"use client"
import { PageHeader } from "@/components/layout/page-header"
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty"
import { useRef, useState, type ReactNode } from "react"
import { ArrowUpDown, MoreHorizontal, Plus, Search } from "lucide-react"
import { toast } from "sonner"
import { useErp } from "./provedor"
import { RecordForm } from "./formulario-registro"
import type { Collection, Data } from "@/features/erp/tipos"
import { rotuloData as dateLabel, hoje as today } from "@/features/erp/datas"
import { totalPedido as orderTotal } from "@/features/pedidos/schemas"
import { formatarMoeda as brl } from "@/lib/formatacao"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SearchSelect } from "./seletor-pesquisavel"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
type Module = "estoque" | "producao" | "comercial" | "financeiro"
type RecordRow = Data[Collection][number]
type DisplayRow = {
  id: string
  label: string
  search: string
  cells: ReactNode[]
  raw: RecordRow
}
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
const statusBadge = (value: string, danger = false) => (
  <Badge variant={danger ? "destructive" : "outline"}>{value}</Badge>
)
const titles = {
  estoque: ["Controle de estoque", "Tecidos, aviamentos e produtos prontos."],
  producao: [
    "Ordens de produção",
    "Organize os lotes, prazos e etapas da confecção.",
  ],
  comercial: [
    "Clientes e pedidos",
    "Clientes, fornecedores e encomendas da confecção.",
  ],
  financeiro: [
    "Controle financeiro",
    "Contas a pagar, a receber e suas liquidações.",
  ],
}
const singular: Record<Collection, string> = {
  materials: "material",
  productions: "ordem de produção",
  clients: "cliente",
  orders: "pedido",
  transactions: "lançamento",
}
export function TelaModulo({
  module,
  initialTab,
}: {
  module: Module
  initialTab?: "clients" | "suppliers" | "orders"
}) {
  const { data, error, reload, remove } = useErp()
  const [tab, setTab] = useState<string>(
    initialTab ?? (module === "comercial" ? "clients" : "all"),
  )
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState("all")
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<boolean | null>(null)
  const [form, setForm] = useState<{
    initial: Record<string, unknown>
    title: string
  } | null>(null)
  const [deleting, setDeleting] = useState<DisplayRow | null>(null)
  const [busy, setBusy] = useState(false)
  const newButton = useRef<HTMLButtonElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
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
  const collection: Collection =
    module === "estoque"
      ? "materials"
      : module === "producao"
        ? "productions"
        : module === "financeiro"
          ? "transactions"
          : tab === "orders"
            ? "orders"
            : "clients"
  const product = (id: string) =>
    data.materials.find((row) => row.id === id)?.name ??
    "Produto não encontrado"
  const client = (id: string) =>
    data.clients.find((row) => row.id === id)?.name ?? "Cliente não encontrado"
  let headings: string[] = []
  let view: DisplayRow[] = []
  let filterOptions: string[] = []
  if (collection === "materials") {
    headings = [
      "Material",
      "Categoria",
      "Saldo",
      "Estoque mínimo",
      "Preço de custo",
      "Margem",
      "Preço de venda",
      "Situação",
    ]
    filterOptions = ["Disponível", "Estoque baixo", "Sem estoque"]
    view = data.materials
      .filter((row) => tab === "all" || row.category === tab)
      .map((row) => {
        const status =
          row.quantity === 0
            ? "Sem estoque"
            : row.quantity <= row.minimum
              ? "Estoque baixo"
              : "Disponível"
        return {
          id: row.id,
          label: row.name,
          search: `${row.code} ${row.name} ${row.description} ${status}`,
          cells: [
            <div key="name">
              <p className="font-medium">{row.name}</p>
              <p className="text-xs text-muted-foreground">{row.code}</p>
              {row.description && (
                <p
                  className="max-w-64 truncate text-xs text-muted-foreground"
                  title={row.description}
                >
                  {row.description}
                </p>
              )}
            </div>,
            row.category,
            `${row.quantity.toLocaleString("pt-BR")} ${row.unit}`,
            `${row.minimum.toLocaleString("pt-BR")} ${row.unit}`,
            brl(row.cost),
            `${row.margin.toLocaleString("pt-BR")}%`,
            brl(row.salePrice),
            statusBadge(status, row.quantity === 0),
          ],
          raw: row,
          status,
        }
      })
      .filter((row) => filter === "all" || row.status === filter)
  } else if (collection === "clients") {
    headings = [
      "Nome / razão social",
      "CPF / CNPJ",
      "Perfil",
      "E-mail",
      "Telefone",
      "Situação",
    ]
    filterOptions = ["Ativo", "Inativo"]
    view = data.clients
      .filter((row) =>
        tab === "suppliers"
          ? row.role !== "Cliente"
          : row.role !== "Fornecedor",
      )
      .filter((row) => filter === "all" || row.status === filter)
      .map((row) => ({
        id: row.id,
        label: row.name,
        search: `${row.name} ${row.document} ${row.email} ${row.phone}`,
        cells: [
          <span key="name" className="font-medium">
            {row.name}
          </span>,
          row.document,
          row.role,
          row.email,
          row.phone,
          statusBadge(row.status),
        ],
        raw: row,
      }))
  } else if (collection === "productions") {
    headings = [
      "Ordem / produto",
      "Quantidade",
      "Início",
      "Previsão",
      "Situação",
    ]
    filterOptions = ["Planejada", "Em produção", "Concluída", "Cancelada"]
    view = data.productions
      .filter((row) => filter === "all" || row.status === filter)
      .map((row) => ({
        id: row.id,
        label: row.code,
        search: `${row.code} ${product(row.productId)} ${row.status}`,
        cells: [
          <div key="name">
            <p className="font-medium">{row.code}</p>
            <p className="text-sm text-muted-foreground">
              {product(row.productId)}
            </p>
          </div>,
          `${row.quantity} peças`,
          dateLabel(row.startDate),
          dateLabel(row.dueDate),
          statusBadge(row.status),
        ],
        raw: row,
      }))
  } else if (collection === "orders") {
    headings = ["Pedido / cliente", "Data", "Entrega", "Total", "Situação"]
    filterOptions = ["Recebido", "Em produção", "Entregue", "Cancelado"]
    view = data.orders
      .filter((row) => filter === "all" || row.status === filter)
      .map((row) => ({
        id: row.id,
        label: row.code,
        search: `${row.code} ${client(row.clientId)} ${row.status}`,
        cells: [
          <div key="name">
            <p className="font-medium">{row.code}</p>
            <p className="text-sm text-muted-foreground">
              {client(row.clientId)}
            </p>
          </div>,
          dateLabel(row.date),
          dateLabel(row.dueDate),
          brl(orderTotal(row)),
          statusBadge(row.status),
        ],
        raw: row,
      }))
  } else {
    headings = ["Lançamento", "Tipo", "Vencimento", "Valor", "Situação"]
    filterOptions = ["Em aberto", "Vencido", "Liquidado"]
    view = data.transactions
      .filter((row) => tab === "all" || row.type === tab)
      .map((row) => {
        const status =
          row.status === "Em aberto" && row.dueDate < today()
            ? "Vencido"
            : row.status
        return {
          id: row.id,
          label: row.description,
          search: `${row.description} ${client(row.partyId)} ${status}`,
          cells: [
            <div key="name">
              <p className="font-medium">{row.description}</p>
              <p className="text-sm text-muted-foreground">
                {client(row.partyId)}
              </p>
            </div>,
            row.type === "Pagar" ? "A pagar" : "A receber",
            dateLabel(row.dueDate),
            brl(row.amount),
            statusBadge(status, status === "Vencido"),
          ],
          raw: row,
          status,
        }
      })
      .filter((row) => filter === "all" || row.status === filter)
  }
  view = view.filter((row) => normalize(row.search).includes(normalize(search)))
  if (sort !== null)
    view.sort(
      (a, b) => (sort ? 1 : -1) * a.label.localeCompare(b.label, "pt-BR"),
    )
  const pages = Math.max(1, Math.ceil(view.length / 10))
  const safePage = Math.min(page, pages - 1)
  const tabs =
    module === "estoque"
      ? [
          { value: "all", label: "Todos" },
          { value: "Tecido", label: "Tecidos" },
          { value: "Aviamento", label: "Aviamentos" },
          { value: "Produto pronto", label: "Produtos prontos" },
        ]
      : module === "comercial" && !initialTab
        ? [
            { value: "clients", label: "Clientes" },
            { value: "suppliers", label: "Fornecedores" },
            { value: "orders", label: "Pedidos" },
          ]
        : module === "financeiro"
          ? [
              { value: "all", label: "Todos" },
              { value: "Pagar", label: "A pagar" },
              { value: "Receber", label: "A receber" },
            ]
          : []
  function openForm(row?: RecordRow, settle = false) {
    returnTo.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const defaults: Record<Collection, Record<string, unknown>> = {
      materials: {
        code: "",
        name: "",
        category: tab === "all" ? "Tecido" : tab,
        unit: tab === "Produto pronto" ? "un." : "m",
        quantity: 0,
        minimum: 0,
        cost: 0,
        description: "",
        margin: 0,
        salePrice: 0,
        kind: "Comprado",
        components: [],
      },
      clients: {
        name: "",
        email: "",
        phone: "",
        status: "Ativo",
        role: tab === "suppliers" ? "Fornecedor" : "Cliente",
        personType: "PF",
        document: "",
        addresses: [
          {
            type: "Principal (faturamento)",
            zip: "",
            street: "",
            neighborhood: "",
          },
        ],
      },
      productions: {
        code: "",
        productId: "",
        quantity: 1,
        startDate: today(),
        dueDate: "",
        status: "Planejada",
        notes: "",
      },
      orders: {
        code: "",
        clientId: "",
        date: today(),
        dueDate: "",
        status: "Recebido",
        items: [{ productId: "", quantity: 1, price: 0 }],
      },
      transactions: {
        description: "",
        type: tab === "Receber" ? "Receber" : "Pagar",
        partyId: "",
        amount: 0,
        dueDate: "",
        status: "Em aberto",
        paidDate: "",
      },
    }
    setForm({
      initial: row
        ? {
            ...row,
            ...(settle ? { status: "Liquidado", paidDate: today() } : {}),
          }
        : defaults[collection],
      title: settle
        ? "Registrar liquidação"
        : `${row ? "Editar" : collection === "productions" ? "Nova" : "Novo"} ${collection === "clients" && tab === "suppliers" ? "fornecedor" : singular[collection]}`,
    })
  }
  const resetFilters = () => {
    setSearch("")
    setFilter("all")
    setPage(0)
  }
  const table = (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            aria-label="Buscar registros"
            className="pl-9"
            placeholder="Buscar por nome ou código..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
          />
        </div>
        <SearchSelect
          value={filter}
          onValueChange={(value) => {
            setFilter(value || "all")
            setPage(0)
          }}
          label="Filtrar por situação"
          className="w-full sm:w-[220px]"
          options={[
            { value: "all", label: "Todas as situações" },
            ...filterOptions.map((value) => ({ value, label: value })),
          ]}
        />
        {(search || filter !== "all") && (
          <Button variant="ghost" onClick={resetFilters}>
            Limpar filtros
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {headings.map((heading, index) => (
                <TableHead
                  key={heading}
                  aria-sort={
                    index === 0
                      ? sort === null
                        ? "none"
                        : sort
                          ? "ascending"
                          : "descending"
                      : undefined
                  }
                >
                  {index === 0 ? (
                    <Button
                      variant="ghost"
                      className="-ml-3"
                      onClick={() =>
                        setSort((value) => (value === null ? true : !value))
                      }
                    >
                      {heading}
                      <ArrowUpDown />
                    </Button>
                  ) : (
                    heading
                  )}
                </TableHead>
              ))}
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {view.length ? (
              view.slice(safePage * 10, safePage * 10 + 10).map((row) => (
                <TableRow key={row.id}>
                  {row.cells.map((cell, index) => (
                    <TableCell key={index} className="tabular-nums">
                      {cell}
                    </TableCell>
                  ))}
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Ações de ${row.label}`}
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openForm(row.raw)}>
                            Editar
                          </DropdownMenuItem>
                          {collection === "transactions" &&
                            "status" in row.raw &&
                            row.raw.status === "Em aberto" && (
                              <DropdownMenuItem
                                onClick={() => openForm(row.raw, true)}
                              >
                                Registrar liquidação
                              </DropdownMenuItem>
                            )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              returnTo.current =
                                document.activeElement as HTMLElement
                              setDeleting(row)
                            }}
                          >
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={headings.length + 1}
                  className="h-32 text-center"
                >
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>Nenhum registro encontrado.</EmptyTitle>
                      <EmptyDescription>
                        Altere os filtros ou adicione um novo cadastro.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {view.length
            ? `${safePage * 10 + 1}–${Math.min(safePage * 10 + 10, view.length)} de ${view.length} registros`
            : "0 registros"}
        </p>
        <div className="flex items-center gap-2">
          <span className="mr-2 text-sm text-muted-foreground">
            Página {safePage + 1} de {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage + 1 >= pages}
            onClick={() => setPage(safePage + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
    </div>
  )
  const total = (type: "Pagar" | "Receber") =>
    data.transactions
      .filter((row) => row.type === type && row.status === "Em aberto")
      .reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100
  return (
    <>
      <PageHeader
        titulo={
          module === "comercial" && initialTab
            ? {
                clients: "Clientes",
                suppliers: "Fornecedores",
                orders: "Pedidos de venda",
              }[initialTab]
            : titles[module][0]
        }
        descricao={titles[module][1]}
        acoes={
          <Button ref={newButton} onClick={() => openForm()}>
            <Plus />
            {collection === "productions"
              ? "Nova ordem"
              : `Novo ${collection === "clients" && tab === "suppliers" ? "fornecedor" : singular[collection]}`}
          </Button>
        }
      />
      {module === "financeiro" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["A receber em aberto", total("Receber")],
            ["A pagar em aberto", total("Pagar")],
            ["Saldo previsto", total("Receber") - total("Pagar")],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {label}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold tabular-nums">
                {brl(Number(value))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {tabs.length ? (
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(String(value))
            resetFilters()
            setSort(null)
          }}
          className="gap-6"
        >
          <TabsList className="h-auto flex-wrap justify-start">
            {tabs.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={tab}>{table}</TabsContent>
        </Tabs>
      ) : (
        table
      )}
      {form && (
        <RecordForm
          key={String(form.initial.id ?? "new")}
          collection={collection}
          initial={form.initial}
          title={form.title}
          onClose={() => {
            setForm(null)
            setPage(0)
            setSearch("")
            setFilter("all")
          }}
          returnFocus={() => {
            const element = returnTo.current
            if (element?.isConnected) element.focus()
            else newButton.current?.focus()
          }}
        />
      )}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(value) => {
          if (!value && !busy) setDeleting(null)
        }}
      >
        <AlertDialogContent finalFocus={newButton}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.label}” será excluído. Registros vinculados serão
              preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (event) => {
                event.preventDefault()
                if (!deleting) return
                setBusy(true)
                try {
                  await remove(collection, deleting.id)
                  setDeleting(null)
                  toast.success("Registro excluído.")
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Não foi possível excluir.",
                  )
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

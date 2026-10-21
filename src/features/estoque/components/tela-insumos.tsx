"use client"

import { useMemo, useRef, useState } from "react"
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Info,
  Minus,
  Package,
  PackageOpen,
  PackageX,
  Pencil,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useErp } from "@/features/erp/components/provedor"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import type { Material } from "../schemas"
import { FormularioInsumo } from "./formulario-insumo"

type Tipo = "Todos" | "Tecido" | "Aviamento"
type Situacao =
  | "Todas as situações"
  | "Abaixo do mínimo"
  | "Sem estoque"
  | "No mínimo"
  | "Regular"

const porPagina = 10
const normalizar = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

function situacaoDo(insumo: Material): Exclude<Situacao, "Todas as situações"> {
  if (insumo.quantity === 0) return "Sem estoque"
  if (insumo.quantity < insumo.minimum) return "Abaixo do mínimo"
  if (insumo.quantity === insumo.minimum) return "No mínimo"
  return "Regular"
}

function BadgeSituacao({ insumo }: { insumo: Material }) {
  const situacao = situacaoDo(insumo)
  if (situacao === "Sem estoque")
    return (
      <Badge variant="destructive">
        <CircleAlert />
        Sem estoque
      </Badge>
    )
  if (situacao === "Abaixo do mínimo")
    return (
      <Badge variant="destructive">
        <TriangleAlert />
        Abaixo do mínimo
      </Badge>
    )
  if (situacao === "No mínimo")
    return (
      <Badge variant="secondary">
        <Minus />
        No mínimo
      </Badge>
    )
  return (
    <Badge variant="outline">
      <Check />
      Regular
    </Badge>
  )
}

export function TelaInsumos() {
  const { data, error, reload } = useErp()
  const [tipo, setTipo] = useState<Tipo>("Todos")
  const [situacao, setSituacao] = useState<Situacao>("Todas as situações")
  const [busca, setBusca] = useState("")
  const [crescente, setCrescente] = useState(true)
  const [pagina, setPagina] = useState(0)
  const [formulario, setFormulario] = useState<Material | "novo" | null>(null)
  const novoRef = useRef<HTMLButtonElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)

  const insumos = useMemo(
    () =>
      (data?.materials ?? []).filter(
        (material) =>
          material.category === "Tecido" || material.category === "Aviamento",
      ),
    [data],
  )

  const filtrados = useMemo(() => {
    const resultado = insumos
      .filter((insumo) => tipo === "Todos" || insumo.category === tipo)
      .filter((insumo) => {
        if (situacao === "Todas as situações") return true
        if (situacao === "Abaixo do mínimo")
          return insumo.quantity < insumo.minimum
        return situacaoDo(insumo) === situacao
      })
      .filter((insumo) =>
        normalizar(`${insumo.name} ${insumo.code}`).includes(normalizar(busca)),
      )
    return resultado.toSorted(
      (a, b) => (crescente ? 1 : -1) * a.name.localeCompare(b.name, "pt-BR"),
    )
  }, [busca, crescente, insumos, situacao, tipo])

  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível carregar os insumos</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error}</p>
          <Button variant="outline" onClick={() => void reload()}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    )

  if (!data)
    return (
      <div role="status" aria-label="Carregando insumos" className="space-y-6">
        <Skeleton className="h-10 w-52" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-80" />
      </div>
    )

  const abaixoDoMinimo = insumos.filter(
    (insumo) => insumo.quantity < insumo.minimum,
  ).length
  const semEstoque = insumos.filter((insumo) => insumo.quantity === 0).length
  const paginas = Math.max(1, Math.ceil(filtrados.length / porPagina))
  const paginaSegura = Math.min(pagina, paginas - 1)
  const visiveis = filtrados.slice(
    paginaSegura * porPagina,
    paginaSegura * porPagina + porPagina,
  )
  const filtrosAtivos =
    tipo !== "Todos" || situacao !== "Todas as situações" || busca.length > 0
  const resumoAtivo = tipo === "Todos" && busca.length === 0

  function abrirFormulario(insumo?: Material) {
    focoAnterior.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setFormulario(insumo ?? "novo")
  }

  function filtrarResumo(novaSituacao: Situacao) {
    setTipo("Todos")
    setBusca("")
    setSituacao(novaSituacao)
    setPagina(0)
  }

  function limparFiltros() {
    setTipo("Todos")
    setSituacao("Todas as situações")
    setBusca("")
    setPagina(0)
  }

  return (
    <>
      <PageHeader
        titulo="Insumos"
        descricao="Tecidos e aviamentos para manter a produção em dia."
        acoes={
          <Button ref={novoRef} onClick={() => abrirFormulario()}>
            <Plus />
            Novo insumo
          </Button>
        }
      />

      <div
        className="grid gap-4 sm:grid-cols-3"
        aria-label="Atalhos de situação"
      >
        <Button
          variant="outline"
          aria-pressed={resumoAtivo && situacao === "Todas as situações"}
          className="h-auto min-h-28 items-start justify-start rounded-xl p-4 text-left aria-pressed:ring-2 aria-pressed:ring-ring"
          onClick={() => filtrarResumo("Todas as situações")}
        >
          <span className="flex w-full flex-col items-start gap-1">
            <span className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
              <Package />
              Insumos cadastrados
            </span>
            <strong className="text-2xl font-semibold tabular-nums">
              {insumos.length}
            </strong>
            <span className="text-xs font-normal text-muted-foreground">
              Ver todos os insumos
            </span>
          </span>
        </Button>
        <Button
          variant="outline"
          aria-pressed={resumoAtivo && situacao === "Abaixo do mínimo"}
          className="h-auto min-h-28 items-start justify-start rounded-xl p-4 text-left aria-pressed:ring-2 aria-pressed:ring-ring"
          onClick={() => filtrarResumo("Abaixo do mínimo")}
        >
          <span className="flex w-full flex-col items-start gap-1">
            <span className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
              <TriangleAlert />
              Abaixo do mínimo
            </span>
            <strong className="text-2xl font-semibold tabular-nums">
              {abaixoDoMinimo}
            </strong>
            <span className="text-xs font-normal text-muted-foreground">
              Ver reposição necessária
            </span>
          </span>
        </Button>
        <Button
          variant="outline"
          aria-pressed={resumoAtivo && situacao === "Sem estoque"}
          className="h-auto min-h-28 items-start justify-start rounded-xl p-4 text-left aria-pressed:ring-2 aria-pressed:ring-ring"
          onClick={() => filtrarResumo("Sem estoque")}
        >
          <span className="flex w-full flex-col items-start gap-1">
            <span className="flex items-center gap-2 text-sm font-normal text-muted-foreground">
              <PackageX />
              Sem estoque
            </span>
            <strong className="text-2xl font-semibold tabular-nums">
              {semEstoque}
            </strong>
            <span className="text-xs font-normal text-muted-foreground">
              Ver saldos zerados
            </span>
          </span>
        </Button>
      </div>

      <Tabs
        value={tipo}
        onValueChange={(value) => {
          setTipo(value as Tipo)
          setPagina(0)
        }}
      >
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="Todos">Todos</TabsTrigger>
          <TabsTrigger value="Tecido">Tecidos</TabsTrigger>
          <TabsTrigger value="Aviamento">Aviamentos</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              aria-label="Buscar insumos"
              className="pl-9"
              placeholder="Buscar por nome ou código..."
              value={busca}
              onChange={(event) => {
                setBusca(event.target.value)
                setPagina(0)
              }}
            />
          </div>
          <SearchSelect
            value={situacao}
            onValueChange={(value) => {
              setSituacao((value || "Todas as situações") as Situacao)
              setPagina(0)
            }}
            label="Filtrar por situação"
            className="w-full sm:w-[220px]"
            options={[
              { value: "Todas as situações", label: "Todas as situações" },
              { value: "Abaixo do mínimo", label: "Abaixo do mínimo" },
              { value: "Sem estoque", label: "Sem estoque" },
              { value: "No mínimo", label: "No mínimo" },
              { value: "Regular", label: "Regular" },
            ]}
          />
          {filtrosAtivos && (
            <Button variant="ghost" onClick={limparFiltros}>
              Limpar filtros
            </Button>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead aria-sort={crescente ? "ascending" : "descending"}>
                  <Button
                    variant="ghost"
                    className="-ml-3"
                    onClick={() => setCrescente((value) => !value)}
                  >
                    Insumo
                    <ArrowUpDown />
                  </Button>
                </TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Saldo atual</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiveis.map((insumo) => {
                const critico = insumo.quantity < insumo.minimum
                return (
                  <TableRow
                    key={insumo.id}
                    className={critico ? "bg-destructive/5" : undefined}
                  >
                    <TableCell>
                      <p className="font-medium">{insumo.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {insumo.code}
                      </p>
                    </TableCell>
                    <TableCell>{insumo.category}</TableCell>
                    <TableCell
                      className={
                        critico
                          ? "text-right font-medium text-destructive tabular-nums"
                          : "text-right tabular-nums"
                      }
                    >
                      {insumo.quantity.toLocaleString("pt-BR")} {insumo.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {insumo.minimum.toLocaleString("pt-BR")} {insumo.unit}
                    </TableCell>
                    <TableCell>
                      <BadgeSituacao insumo={insumo} />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Editar ${insumo.name}`}
                        onClick={() => abrirFormulario(insumo)}
                      >
                        <Pencil />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              {!visiveis.length && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <Empty className="py-12">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <PackageOpen />
                        </EmptyMedia>
                        <EmptyTitle>
                          {insumos.length
                            ? "Nenhum insumo encontrado"
                            : "Seu estoque começa por aqui"}
                        </EmptyTitle>
                        <EmptyDescription>
                          {insumos.length
                            ? "Tente outra busca ou limpe os filtros para ver todos os insumos."
                            : "Cadastre o primeiro insumo para acompanhar saldos e identificar o que precisa de reposição."}
                        </EmptyDescription>
                      </EmptyHeader>
                      {!insumos.length && (
                        <Button
                          variant="outline"
                          onClick={() => abrirFormulario()}
                        >
                          <Plus />
                          Cadastrar insumo
                        </Button>
                      )}
                    </Empty>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <p role="status">
            {filtrados.length
              ? `${paginaSegura * porPagina + 1}–${Math.min((paginaSegura + 1) * porPagina, filtrados.length)} de ${filtrados.length} insumos`
              : "0 insumos"}
          </p>
          <div className="flex items-center gap-2">
            <span>
              Página {paginaSegura + 1} de {paginas}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Página anterior"
              disabled={paginaSegura === 0}
              onClick={() => setPagina(paginaSegura - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Próxima página"
              disabled={paginaSegura + 1 >= paginas}
              onClick={() => setPagina(paginaSegura + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5" />O destaque considera o saldo e o estoque
          mínimo de cada insumo.
        </p>
      </div>

      {formulario && (
        <FormularioInsumo
          key={formulario === "novo" ? "novo" : formulario.id}
          initial={formulario === "novo" ? undefined : formulario}
          onClose={() => setFormulario(null)}
          returnFocus={() => {
            const elemento = focoAnterior.current
            if (elemento?.isConnected) elemento.focus()
            else novoRef.current?.focus()
          }}
        />
      )}
    </>
  )
}

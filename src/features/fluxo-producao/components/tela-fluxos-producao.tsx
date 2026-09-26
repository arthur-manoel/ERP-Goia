"use client"

import { useMemo, useRef, useState } from "react"
import { MoreHorizontal, Pencil, Plus, Search, Undo2, Workflow } from "lucide-react"
import { toast } from "sonner"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useErp } from "@/features/erp/components/provedor"
import type { FluxoProducao } from "../schemas"
import { FormularioFluxo } from "./formulario-fluxo"
import { VisualizadorFluxo } from "./visualizador-fluxo"

type FiltroStatus = "Todos" | "Ativo" | "Inativo"

export function TelaFluxosProducao() {
  const { data, error, reload, save } = useErp()
  const [busca, setBusca] = useState("")
  const [statusFiltro, setStatusFiltro] = useState<FiltroStatus>("Todos")
  const [formulario, setFormulario] = useState<FluxoProducao | "novo" | null>(
    null,
  )
  const novoRef = useRef<HTMLButtonElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)

  const fluxos = data?.productionFlows ?? []
  const setores = data?.sectors ?? []

  const filtrados = useMemo(() => {
    return fluxos
      .filter(
        (fluxo) => statusFiltro === "Todos" || fluxo.status === statusFiltro,
      )
      .filter((fluxo) =>
        fluxo.name.toLowerCase().includes(busca.trim().toLowerCase()),
      )
      .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  }, [fluxos, busca, statusFiltro])

  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível carregar os fluxos de produção</AlertTitle>
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
      <div
        role="status"
        aria-label="Carregando fluxos de produção"
        className="space-y-6"
      >
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-80" />
      </div>
    )

  function abrirFormulario(fluxo?: FluxoProducao) {
    focoAnterior.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setFormulario(fluxo ?? "novo")
  }

  async function alternarStatus(fluxo: FluxoProducao) {
    const novoStatus = fluxo.status === "Ativo" ? "Inativo" : "Ativo"
    try {
      await save(
        "productionFlows",
        { ...fluxo, status: novoStatus },
        fluxo.id,
      )
      toast.success(
        novoStatus === "Ativo"
          ? "Fluxo de produção reativado."
          : "Fluxo de produção inativado.",
      )
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a operação.",
      )
    }
  }

  return (
    <>
      <PageHeader
        titulo="Fluxos de produção"
        descricao="Sequência de setores pela qual uma peça passa durante a produção."
        acoes={
          <Button ref={novoRef} onClick={() => abrirFormulario()}>
            <Plus />
            Novo fluxo
          </Button>
        }
      />

      <Tabs
        value={statusFiltro}
        onValueChange={(value) => setStatusFiltro(value as FiltroStatus)}
      >
        <TabsList>
          <TabsTrigger value="Todos">Todos</TabsTrigger>
          <TabsTrigger value="Ativo">Ativos</TabsTrigger>
          <TabsTrigger value="Inativo">Inativos</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            aria-label="Pesquisar fluxos de produção"
            className="pl-9"
            placeholder="Pesquisar por nome..."
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fluxo</TableHead>
                <TableHead>Caminho da produção</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((fluxo) => (
                <TableRow key={fluxo.id}>
                  <TableCell className="align-top font-medium">
                    <p>{fluxo.name}</p>
                    {fluxo.description && (
                      <p className="text-xs font-normal text-muted-foreground">
                        {fluxo.description}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <VisualizadorFluxo fluxo={fluxo} setores={setores} />
                  </TableCell>
                  <TableCell className="align-top">
                    <Badge
                      variant={
                        fluxo.status === "Ativo" ? "outline" : "secondary"
                      }
                    >
                      {fluxo.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Ações para ${fluxo.name}`}
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => abrirFormulario(fluxo)}>
                          <Pencil /> Editar
                        </DropdownMenuItem>
                        {fluxo.status === "Ativo" ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => void alternarStatus(fluxo)}
                          >
                            Excluir (inativar)
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => void alternarStatus(fluxo)}
                          >
                            <Undo2 /> Reativar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {!filtrados.length && (
                <TableRow>
                  <TableCell colSpan={4} className="p-0">
                    <Empty className="py-12">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Workflow />
                        </EmptyMedia>
                        <EmptyTitle>
                          {fluxos.length
                            ? "Nenhum fluxo encontrado"
                            : "Cadastre o primeiro fluxo de produção"}
                        </EmptyTitle>
                        <EmptyDescription>
                          {fluxos.length
                            ? "Tente outra busca ou outro filtro de status."
                            : "Um fluxo define a sequência de setores (ex.: Corte → Costura → Acabamento) que uma peça deve seguir."}
                        </EmptyDescription>
                      </EmptyHeader>
                      {!fluxos.length && (
                        <Button
                          variant="outline"
                          onClick={() => abrirFormulario()}
                        >
                          <Plus />
                          Cadastrar fluxo
                        </Button>
                      )}
                    </Empty>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {formulario && (
        <FormularioFluxo
          key={formulario === "novo" ? "novo" : formulario.id}
          initial={formulario === "novo" ? undefined : formulario}
          setoresDisponiveis={setores}
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

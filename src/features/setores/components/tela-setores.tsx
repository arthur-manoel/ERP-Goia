"use client"

import { useMemo, useRef, useState } from "react"
import {
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Undo2,
  Waypoints,
} from "lucide-react"
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
import type { Setor } from "../schemas"
import { FormularioSetor } from "./formulario-setor"

type FiltroStatus = "Todos" | "Ativo" | "Inativo"

export function TelaSetores() {
  const { data, error, reload, save } = useErp()
  const [busca, setBusca] = useState("")
  const [statusFiltro, setStatusFiltro] = useState<FiltroStatus>("Todos")
  const [formulario, setFormulario] = useState<Setor | "novo" | null>(null)
  const novoRef = useRef<HTMLButtonElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)

  const setores = data?.sectors ?? []

  const filtrados = useMemo(() => {
    return setores
      .filter(
        (setor) => statusFiltro === "Todos" || setor.status === statusFiltro,
      )
      .filter((setor) =>
        setor.name.toLowerCase().includes(busca.trim().toLowerCase()),
      )
      .toSorted((a, b) => a.name.localeCompare(b.name, "pt-BR"))
  }, [setores, busca, statusFiltro])

  if (error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Não foi possível carregar os setores</AlertTitle>
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
      <div role="status" aria-label="Carregando setores" className="space-y-6">
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-80" />
      </div>
    )

  function abrirFormulario(setor?: Setor) {
    focoAnterior.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setFormulario(setor ?? "novo")
  }

  async function alternarStatus(setor: Setor) {
    const novoStatus = setor.status === "Ativo" ? "Inativo" : "Ativo"
    try {
      await save("sectors", { ...setor, status: novoStatus }, setor.id)
      toast.success(
        novoStatus === "Ativo" ? "Setor reativado." : "Setor inativado.",
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
        titulo="Setores"
        descricao="Locais/etapas da produção, usados para montar os fluxos de produção."
        acoes={
          <Button ref={novoRef} onClick={() => abrirFormulario()}>
            <Plus />
            Novo setor
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
            aria-label="Pesquisar setores"
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
                <TableHead>Setor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtrados.map((setor) => (
                <TableRow key={setor.id}>
                  <TableCell className="font-medium">{setor.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {setor.type}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {setor.description || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        setor.status === "Ativo" ? "outline" : "secondary"
                      }
                    >
                      {setor.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Ações para ${setor.name}`}
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => abrirFormulario(setor)}
                        >
                          <Pencil /> Editar
                        </DropdownMenuItem>
                        {setor.status === "Ativo" ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => void alternarStatus(setor)}
                          >
                            Excluir (inativar)
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => void alternarStatus(setor)}
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
                  <TableCell colSpan={5} className="p-0">
                    <Empty className="py-12">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Waypoints />
                        </EmptyMedia>
                        <EmptyTitle>
                          {setores.length
                            ? "Nenhum setor encontrado"
                            : "Cadastre o primeiro setor"}
                        </EmptyTitle>
                        <EmptyDescription>
                          {setores.length
                            ? "Tente outra busca ou outro filtro de status."
                            : "Setores são os locais/etapas da produção (ex.: Corte, Costura, Acabamento) usados para montar os fluxos de produção."}
                        </EmptyDescription>
                      </EmptyHeader>
                      {!setores.length && (
                        <Button
                          variant="outline"
                          onClick={() => abrirFormulario()}
                        >
                          <Plus />
                          Cadastrar setor
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
        <FormularioSetor
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

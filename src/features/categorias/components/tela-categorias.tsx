"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Tags,
  Undo2,
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { PageHeader } from "@/components/layout/page-header"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import type { Categoria, DadosCategoria } from "../tipos"
import {
  alterarStatusCategoria,
  listarCategorias,
  salvarCategoria,
} from "../api"
import { FormularioCategoria } from "./formulario-categoria"

type FiltroStatus = "todas" | "ATIVA" | "INATIVA"

function SeletorEmpresa() {
  const { empresa, empresas, selecionarEmpresa } = useAutenticacao()
  if (empresas.length < 2) return null
  return (
    <SearchSelect
      label="Empresa ativa"
      placeholder="Selecione uma empresa"
      className="w-full sm:w-80"
      value={empresa ? String(empresa.id) : ""}
      onValueChange={(valor) => selecionarEmpresa(Number(valor))}
      options={empresas.map((item) => ({
        value: String(item.id),
        label: item.nome,
      }))}
    />
  )
}

export function TelaCategorias() {
  const { estado, empresa, usuario } = useAutenticacao()
  if (estado === "autenticado" && empresa) {
    return (
      <CategoriasEmpresa
        key={`${usuario?.email}:${empresa.id}`}
        empresa={empresa}
      />
    )
  }
  return (
    <>
      <PageHeader
        titulo="Categorias de produto"
        descricao="Organize os produtos do catálogo da empresa."
      />
      {estado === "carregando" ? (
        <Skeleton className="h-64 w-full" aria-label="Carregando categorias" />
      ) : (
        <>
          <SeletorEmpresa />
          <Alert>
            <AlertDescription>
              {estado === "anonimo" ? (
                <>
                  Entre na sua conta para consultar categorias.{" "}
                  <Link href="/login" className="underline">
                    Ir para o login
                  </Link>
                </>
              ) : (
                "Selecione uma empresa ativa para visualizar suas categorias."
              )}
            </AlertDescription>
          </Alert>
        </>
      )}
    </>
  )
}

function CategoriasEmpresa({
  empresa,
}: {
  empresa: { id: number; nome: string }
}) {
  const { requisitar } = useAutenticacao()
  const [busca, setBusca] = useState("")
  const [buscaAplicada, setBuscaAplicada] = useState("")
  const [status, setStatus] = useState<FiltroStatus>("todas")
  const [pagina, setPagina] = useState(1)
  const [revisao, setRevisao] = useState(0)
  const chave = JSON.stringify([buscaAplicada, status, pagina, revisao])
  const [resultado, setResultado] = useState<{
    chave: string
    categorias: Categoria[]
    total: number
    totalPaginas: number
    erro: string | null
  } | null>(null)
  const carregando = resultado?.chave !== chave
  const erro = carregando ? null : resultado?.erro
  const filtradas = carregando ? [] : (resultado?.categorias ?? [])
  const total = resultado?.total ?? 0
  const totalPaginas = Math.max(1, resultado?.totalPaginas ?? 1)
  const [formulario, setFormulario] = useState<"novo" | Categoria | null>(null)
  const [alterando, setAlterando] = useState<Categoria | null>(null)
  const [pendente, setPendente] = useState(false)
  const [erroAcao, setErroAcao] = useState("")
  const botaoNovo = useRef<HTMLButtonElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)
  const ativa = useRef(true)

  useEffect(() => {
    ativa.current = true
    return () => {
      ativa.current = false
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBuscaAplicada(busca.trim())
      setPagina(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [busca])

  useEffect(() => {
    const controller = new AbortController()
    void listarCategorias(
      requisitar,
      empresa.id,
      { busca: buscaAplicada, status, pagina },
      controller.signal,
    ).then(
      (dados) => {
        if (controller.signal.aborted) return
        if (pagina > Math.max(1, dados.totalPages)) {
          setPagina(Math.max(1, dados.totalPages))
          return
        }
        setResultado({
          chave,
          categorias: dados.rows,
          total: dados.count,
          totalPaginas: dados.totalPages,
          erro: null,
        })
      },
      (causa: unknown) => {
        if (controller.signal.aborted) return
        setResultado({
          chave,
          categorias: [],
          total: 0,
          totalPaginas: 0,
          erro:
            causa instanceof Error
              ? causa.message
              : "Não foi possível consultar categorias.",
        })
      },
    )
    return () => controller.abort()
  }, [requisitar, empresa.id, buscaAplicada, status, pagina, chave])

  async function onSalvar(
    dados: DadosCategoria,
    idEmpresa: number,
    categoria?: Categoria,
  ) {
    await salvarCategoria(requisitar, idEmpresa, dados, categoria)
    if (!ativa.current) return
    toast.success(categoria ? "Categoria atualizada." : "Categoria cadastrada.")
    setRevisao((atual) => atual + 1)
  }

  async function onAlterarStatus(categoria: Categoria, idEmpresa: number) {
    await alterarStatusCategoria(requisitar, idEmpresa, categoria)
    if (!ativa.current) return
    toast.success(
      categoria.status === "ATIVA"
        ? "Categoria inativada."
        : "Categoria reativada.",
    )
    setRevisao((atual) => atual + 1)
  }

  function onRecarregar() {
    setRevisao((atual) => atual + 1)
  }

  function abrirFormulario(categoria?: Categoria) {
    focoAnterior.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setFormulario(categoria ?? "novo")
  }

  async function confirmarAlteracao() {
    if (!alterando || alterando.id_empresa !== empresa.id || pendente) return
    setPendente(true)
    setErroAcao("")
    try {
      await onAlterarStatus(alterando, empresa.id)
      setAlterando(null)
    } catch (causa) {
      setErroAcao(
        causa instanceof Error
          ? causa.message
          : "Não foi possível alterar a situação.",
      )
    } finally {
      setPendente(false)
    }
  }

  const filtrado = busca.trim() !== "" || status !== "todas"

  return (
    <>
      <PageHeader
        titulo="Categorias de produto"
        descricao="Organize os produtos do catálogo da empresa."
        acoes={
          <Button ref={botaoNovo} onClick={() => abrirFormulario()}>
            <Plus /> Nova categoria
          </Button>
        }
      />

      <SeletorEmpresa />
      {erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{erro}</span>
            <Button variant="outline" size="sm" onClick={onRecarregar}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full min-w-0 sm:max-w-sm sm:flex-1">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              aria-label="Buscar categorias"
              className="pl-9"
              placeholder="Buscar por nome..."
              maxLength={100}
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
            />
          </div>
          <Tabs
            value={status}
            onValueChange={(valor) => {
              setStatus(valor as FiltroStatus)
              setPagina(1)
            }}
          >
            <TabsList>
              <TabsTrigger value="todas">Todas</TabsTrigger>
              <TabsTrigger value="ATIVA">Ativas</TabsTrigger>
              <TabsTrigger value="INATIVA">Inativas</TabsTrigger>
            </TabsList>
          </Tabs>
          {filtrado && (
            <Button
              variant="ghost"
              onClick={() => {
                setBusca("")
                setBuscaAplicada("")
                setStatus("todas")
                setPagina(1)
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table className="min-w-[580px]">
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregando ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Skeleton
                      role="status"
                      aria-label="Carregando categorias"
                      className="h-32 w-full"
                    />
                  </TableCell>
                </TableRow>
              ) : erro ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-32 text-center text-muted-foreground"
                  >
                    Não foi possível exibir as categorias.
                  </TableCell>
                </TableRow>
              ) : filtradas.length ? (
                filtradas.map((categoria) => (
                  <TableRow key={categoria.id}>
                    <TableCell className="font-medium">
                      {categoria.nome}
                    </TableCell>
                    <TableCell className="max-w-md text-muted-foreground">
                      {categoria.descricao || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          categoria.status === "ATIVA" ? "outline" : "secondary"
                        }
                      >
                        {categoria.status === "ATIVA" ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Ações para ${categoria.nome}`}
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => abrirFormulario(categoria)}
                          >
                            <Pencil /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant={
                              categoria.status === "ATIVA"
                                ? "destructive"
                                : "default"
                            }
                            onClick={() => {
                              setErroAcao("")
                              setAlterando(categoria)
                            }}
                          >
                            {categoria.status === "ATIVA" ? (
                              "Inativar"
                            ) : (
                              <>
                                <Undo2 /> Reativar
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-56">
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <Tags />
                        </EmptyMedia>
                        <EmptyTitle>
                          {filtrado
                            ? "Nenhuma categoria encontrada"
                            : "Nenhuma categoria cadastrada"}
                        </EmptyTitle>
                        <EmptyDescription>
                          {filtrado
                            ? "Tente outro nome ou filtro de situação."
                            : "As categorias ajudam a organizar os produtos do catálogo."}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {!carregando && !erro && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {total} {total === 1 ? "categoria" : "categorias"} · Página{" "}
              {pagina} de {totalPaginas}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Página anterior"
                disabled={pagina <= 1}
                onClick={() => setPagina(pagina - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Próxima página"
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina(pagina + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </div>

      {formulario && (
        <FormularioCategoria
          key={formulario === "novo" ? "novo" : formulario.id}
          categoria={formulario === "novo" ? undefined : formulario}
          empresaNome={empresa.nome}
          onClose={() => setFormulario(null)}
          returnFocus={() => {
            if (focoAnterior.current?.isConnected) focoAnterior.current.focus()
            else botaoNovo.current?.focus()
          }}
          onSalvar={(dados, categoria) =>
            onSalvar(dados, empresa.id, categoria)
          }
        />
      )}

      {alterando && (
        <AlertDialog
          open={!!alterando}
          onOpenChange={(aberto) => {
            if (!aberto && !pendente) setAlterando(null)
          }}
        >
          <AlertDialogContent
            finalFocus={() => {
              botaoNovo.current?.focus()
              return false
            }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>
                {alterando?.status === "ATIVA"
                  ? "Inativar categoria?"
                  : "Reativar categoria?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {alterando?.status === "ATIVA"
                  ? `A categoria ${alterando.nome} deixará de estar disponível para novos cadastros de produtos.`
                  : `A categoria ${alterando?.nome} voltará a ficar disponível.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {erroAcao && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{erroAcao}</AlertDescription>
              </Alert>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pendente}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={pendente}
                variant={
                  alterando?.status === "ATIVA" ? "destructive" : "default"
                }
                onClick={() => void confirmarAlteracao()}
              >
                {pendente
                  ? "Aguarde…"
                  : alterando?.status === "ATIVA"
                    ? "Inativar"
                    : "Reativar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}

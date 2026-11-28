"use client"

import Link from "next/link"
import {
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/layout/page-header"
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { filtrarLocais } from "../regras"
import type { FiltroStatus, LocalEstoque, RespostaPaginada } from "../tipos"
import { FormularioLocalEstoque } from "./formulario-local-estoque"

const endpoint = "/api/locais_estoque"
const limitePorPagina = 10
// Máximo aceito pela API em uma única chamada.
const limiteApi = 100

export function TelaLocaisEstoque() {
  const {
    estado: estadoAutenticacao,
    empresas,
    empresa,
    selecionarEmpresa,
    requisitar,
  } = useAutenticacao()
  const [locais, setLocais] = useState<LocalEstoque[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState("")
  const [busca, setBusca] = useState("")
  const [status, setStatus] = useState<FiltroStatus>("todos")
  const [pagina, setPagina] = useState(0)
  // "novo" abre o cadastro; um LocalEstoque abre a edição dele; null fecha.
  const [dialogo, setDialogo] = useState<"novo" | LocalEstoque | null>(null)
  const [inativando, setInativando] = useState<LocalEstoque | null>(null)
  const [processando, setProcessando] = useState(false)
  const versaoRequisicao = useRef(0)
  const empresaCarregada = useRef<number | null>(null)

  // A API devolve no máximo 100 por chamada: carregamos todas as páginas e a
  // busca por texto (sem acento) é feita no navegador.
  const recarregar = useCallback(async () => {
    if (!empresa) return
    const versaoAtual = ++versaoRequisicao.current
    setCarregando(true)
    try {
      const todos: LocalEstoque[] = []
      let paginaAtual = 1
      let totalPaginas = 1
      do {
        const parametros = new URLSearchParams({
          page: String(paginaAtual),
          limit: String(limiteApi),
        })
        const resposta = await requisitar(`${endpoint}?${parametros}`)
        if (!resposta.ok) throw new Error(await mensagemErro(resposta))
        const corpo = (await resposta.json()) as { data: RespostaPaginada }
        todos.push(...corpo.data.rows)
        totalPaginas = corpo.data.totalPages
        paginaAtual += 1
      } while (paginaAtual <= totalPaginas)
      if (versaoAtual !== versaoRequisicao.current) return
      setLocais(todos)
      setErro("")
    } catch (causa) {
      if (versaoAtual !== versaoRequisicao.current) return
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível carregar os locais de estoque.",
      )
    } finally {
      if (versaoAtual === versaoRequisicao.current) setCarregando(false)
    }
  }, [empresa, requisitar])

  useEffect(() => {
    if (estadoAutenticacao !== "autenticado" || !empresa) return
    const idEmpresa = empresa.id
    void Promise.resolve().then(() => {
      // Ao trocar de empresa, descarta o que era da anterior (lista, busca,
      // janelas abertas) para nunca mostrar ou editar locais de outra empresa.
      if (empresaCarregada.current !== idEmpresa) {
        empresaCarregada.current = idEmpresa
        setLocais([])
        setErro("")
        setDialogo(null)
        setInativando(null)
      }
      return recarregar()
    })
  }, [empresa, estadoAutenticacao, recarregar])

  const filtrados = useMemo(
    () => filtrarLocais(locais, busca, status),
    [locais, busca, status],
  )
  const totalPaginas = Math.max(
    1,
    Math.ceil(filtrados.length / limitePorPagina),
  )
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtrados.slice(
    paginaAtual * limitePorPagina,
    (paginaAtual + 1) * limitePorPagina,
  )

  async function inativar() {
    if (!inativando) return
    setProcessando(true)
    try {
      const resposta = await requisitar(`${endpoint}/${inativando.id}`, {
        method: "DELETE",
      })
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success("Local de estoque inativado.")
      setInativando(null)
      await recarregar()
    } catch (causa) {
      // Ex.: 409 "O local ainda tem saldo ou reserva em estoque..."
      toast.error(
        causa instanceof Error ? causa.message : "Não foi possível inativar.",
      )
    } finally {
      setProcessando(false)
    }
  }

  async function reativar(local: LocalEstoque) {
    setProcessando(true)
    try {
      const resposta = await requisitar(`${endpoint}/${local.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ATIVO" }),
      })
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success("Local de estoque reativado.")
      await recarregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error ? causa.message : "Não foi possível reativar.",
      )
    } finally {
      setProcessando(false)
    }
  }

  const seletorEmpresa =
    empresas.length > 1 ? (
      <SearchSelect
        value={empresa ? String(empresa.id) : ""}
        onValueChange={(valor) => {
          setPagina(0)
          selecionarEmpresa(Number(valor))
        }}
        label="Empresa ativa"
        className="w-full sm:w-80"
        options={empresas.map((item) => ({
          value: String(item.id),
          label: item.nome,
        }))}
      />
    ) : null

  const cabecalho = (
    <PageHeader
      titulo="Locais de estoque"
      descricao="Lojas, depósitos e outros locais onde o estoque da empresa fica guardado."
      acoes={
        <Button onClick={() => setDialogo("novo")} disabled={!empresa}>
          <Plus /> Novo local
        </Button>
      }
    />
  )

  if (estadoAutenticacao === "carregando")
    return (
      <>
        {cabecalho}
        <Skeleton
          role="status"
          aria-label="Carregando locais de estoque"
          className="h-80 w-full"
        />
      </>
    )

  if (estadoAutenticacao === "anonimo")
    return (
      <>
        {cabecalho}
        <Alert>
          <AlertDescription>
            Entre na sua conta para gerenciar os locais de estoque.{" "}
            <Link href="/login" className="underline">
              Ir para o login
            </Link>
          </AlertDescription>
        </Alert>
      </>
    )

  if (!empresa)
    return (
      <>
        {cabecalho}
        <Alert>
          <AlertDescription>
            Selecione uma empresa para gerenciar os locais de estoque.
          </AlertDescription>
        </Alert>
        {seletorEmpresa}
      </>
    )

  return (
    <>
      {cabecalho}
      {seletorEmpresa}

      {erro ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="space-y-3">
            <p>{erro}</p>
            <Button variant="outline" onClick={() => void recarregar()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Tabs
            value={status}
            onValueChange={(valor) => {
              setStatus(valor as FiltroStatus)
              setPagina(0)
            }}
          >
            <TabsList>
              <TabsTrigger value="todos">Todos</TabsTrigger>
              <TabsTrigger value="ativos">Ativos</TabsTrigger>
              <TabsTrigger value="inativos">Inativos</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                aria-label="Buscar locais de estoque"
                className="pl-9"
                placeholder="Buscar por nome ou descrição..."
                value={busca}
                onChange={(evento) => {
                  setBusca(evento.target.value)
                  setPagina(0)
                }}
              />
            </div>
            {busca && (
              <Button
                variant="ghost"
                onClick={() => {
                  setBusca("")
                  setPagina(0)
                }}
              >
                Limpar busca
              </Button>
            )}
          </div>

          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-32 text-center text-muted-foreground"
                    >
                      Carregando locais de estoque…
                    </TableCell>
                  </TableRow>
                ) : visiveis.length ? (
                  visiveis.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.nome}</TableCell>
                      <TableCell className="max-w-96 truncate text-muted-foreground">
                        {item.descricao || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "ATIVO" ? "outline" : "secondary"
                          }
                        >
                          {item.status === "ATIVO" ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Ações de ${item.nome}`}
                                disabled={processando}
                              />
                            }
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Ações</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => setDialogo(item)}
                              >
                                <Pencil /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {item.status === "ATIVO" ? (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setInativando(item)}
                                >
                                  <Trash2 /> Inativar
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => void reativar(item)}
                                >
                                  <Undo2 /> Reativar
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-40">
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <MapPin />
                          </EmptyMedia>
                          <EmptyTitle>
                            {locais.length
                              ? "Nenhum local encontrado"
                              : "Cadastre o primeiro local de estoque"}
                          </EmptyTitle>
                          <EmptyDescription>
                            {locais.length
                              ? "Tente outra busca ou outro filtro de status."
                              : "Locais como loja, depósito ou prateleira organizam onde cada produto está guardado."}
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
              {filtrados.length
                ? `${paginaAtual * limitePorPagina + 1}–${Math.min((paginaAtual + 1) * limitePorPagina, filtrados.length)} de ${filtrados.length} locais`
                : "0 locais"}
            </p>
            <div className="flex items-center gap-2">
              <span className="mr-2 text-sm text-muted-foreground">
                Página {paginaAtual + 1} de {totalPaginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={paginaAtual === 0 || carregando}
                onClick={() => setPagina(paginaAtual - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={paginaAtual + 1 >= totalPaginas || carregando}
                onClick={() => setPagina(paginaAtual + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}

      {dialogo && (
        <FormularioLocalEstoque
          key={dialogo === "novo" ? "novo" : dialogo.id}
          local={dialogo === "novo" ? null : dialogo}
          onClose={() => setDialogo(null)}
          onSaved={recarregar}
        />
      )}

      <AlertDialog
        open={!!inativando}
        onOpenChange={(aberto) => {
          if (!aberto && !processando) setInativando(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar local de estoque?</AlertDialogTitle>
            <AlertDialogDescription>
              “{inativando?.nome}” deixará de ser oferecido para novas
              movimentações. O histórico (kardex, entradas e saídas) é
              preservado. Se ainda houver saldo ou reserva neste local, a
              inativação será recusada: transfira ou baixe o saldo antes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processando}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={processando}
              onClick={() => void inativar()}
            >
              {processando ? "Inativando…" : "Inativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

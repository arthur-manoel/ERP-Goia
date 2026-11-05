"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
  Waypoints,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import {
  alterarAtivoSetor,
  ErroApiSetores,
  excluirSetor,
  listarSetores,
} from "../api"
import type { FiltroStatus, Paginacao, SetorApi } from "../tipos"
import { DialogoDetalheSetor } from "./dialogo-detalhe-setor"
import { FormularioSetor } from "./formulario-setor"

const limitePorPagina = 10

export function TelaSetores() {
  const {
    estado: estadoAutenticacao,
    empresas,
    empresa,
    selecionarEmpresa,
    requisitar,
  } = useAutenticacao()
  const [setores, setSetores] = useState<SetorApi[]>([])
  const [paginacao, setPaginacao] = useState<Paginacao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<{
    mensagem: string
    status?: number
  } | null>(null)
  const [busca, setBusca] = useState("")
  const [buscaAplicada, setBuscaAplicada] = useState("")
  const [status, setStatus] = useState<FiltroStatus>("TODOS")
  const [pagina, setPagina] = useState(1)
  const [formulario, setFormulario] = useState<SetorApi | "novo" | null>(null)
  const [detalhe, setDetalhe] = useState<number | null>(null)
  const [excluindo, setExcluindo] = useState<SetorApi | null>(null)
  const [processandoExclusao, setProcessandoExclusao] = useState(false)
  const novoRef = useRef<HTMLButtonElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)
  const versaoRequisicao = useRef(0)

  // Busca com atraso para não consultar a API a cada tecla.
  useEffect(() => {
    const espera = setTimeout(() => {
      setBuscaAplicada(busca)
      setPagina(1)
    }, 300)
    return () => clearTimeout(espera)
  }, [busca])

  const recarregar = useCallback(async () => {
    if (!empresa) return
    const versao = ++versaoRequisicao.current
    setCarregando(true)
    try {
      const resposta = await listarSetores(requisitar, {
        busca: buscaAplicada,
        status,
        pagina,
        limite: limitePorPagina,
      })
      if (versao !== versaoRequisicao.current) return
      setSetores(resposta.setores)
      setPaginacao(resposta.paginacao)
      setErro(null)
    } catch (causa) {
      if (versao !== versaoRequisicao.current) return
      setErro({
        mensagem:
          causa instanceof Error
            ? causa.message
            : "Não foi possível carregar os setores.",
        status: causa instanceof ErroApiSetores ? causa.status : undefined,
      })
    } finally {
      if (versao === versaoRequisicao.current) setCarregando(false)
    }
  }, [empresa, requisitar, buscaAplicada, status, pagina])

  useEffect(() => {
    if (estadoAutenticacao !== "autenticado" || !empresa) return
    void Promise.resolve().then(recarregar)
  }, [estadoAutenticacao, empresa, recarregar])

  function abrirFormulario(setor?: SetorApi) {
    focoAnterior.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setFormulario(setor ?? "novo")
  }

  async function alternarAtivo(setor: SetorApi) {
    try {
      await alterarAtivoSetor(requisitar, setor, !setor.ativo)
      toast.success(setor.ativo ? "Setor inativado." : "Setor reativado.")
      await recarregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error
          ? causa.message
          : "Não foi possível concluir a operação.",
      )
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return
    setProcessandoExclusao(true)
    try {
      await excluirSetor(requisitar, excluindo.id)
      toast.success("Setor excluído.")
      setExcluindo(null)
      // Ao excluir o último item de uma página, volta para a anterior.
      if (setores.length === 1 && pagina > 1) setPagina(pagina - 1)
      else await recarregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error ? causa.message : "Não foi possível excluir.",
      )
      setExcluindo(null)
    } finally {
      setProcessandoExclusao(false)
    }
  }

  const seletorEmpresa =
    empresas.length > 1 ? (
      <SearchSelect
        value={empresa ? String(empresa.id) : ""}
        onValueChange={(valor) => {
          setPagina(1)
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
      titulo="Setores"
      descricao="Locais/etapas da produção, usados para montar os fluxos de produção."
      acoes={
        <Button
          ref={novoRef}
          onClick={() => abrirFormulario()}
          disabled={!empresa}
        >
          <Plus />
          Novo setor
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
          aria-label="Carregando setores"
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
            Entre na sua conta para gerenciar setores.{" "}
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
            Selecione uma empresa para gerenciar setores.
          </AlertDescription>
        </Alert>
        {seletorEmpresa}
      </>
    )

  const semAutorizacao = erro?.status === 401 || erro?.status === 403
  const filtrando = buscaAplicada.trim() !== "" || status !== "TODOS"
  const totalPaginas = Math.max(1, paginacao?.totalPaginas ?? 1)

  return (
    <>
      {cabecalho}
      {seletorEmpresa}

      <Tabs
        value={status}
        onValueChange={(valor) => {
          setStatus(valor as FiltroStatus)
          setPagina(1)
        }}
      >
        <TabsList>
          <TabsTrigger value="TODOS">Todos</TabsTrigger>
          <TabsTrigger value="ATIVO">Ativos</TabsTrigger>
          <TabsTrigger value="INATIVO">Inativos</TabsTrigger>
        </TabsList>
      </Tabs>

      {erro ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>
            {semAutorizacao
              ? "Você não tem autorização para ver os setores"
              : "Não foi possível carregar os setores"}
          </AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{erro.mensagem}</p>
            {!semAutorizacao && (
              <Button variant="outline" onClick={() => void recarregar()}>
                Tentar novamente
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              aria-label="Pesquisar setores"
              className="pl-9"
              placeholder="Pesquisar por nome..."
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
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
                {carregando && !setores.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      role="status"
                      className="h-32 text-center text-muted-foreground"
                    >
                      Carregando setores…
                    </TableCell>
                  </TableRow>
                ) : setores.length ? (
                  setores.map((setor) => (
                    <TableRow key={setor.id}>
                      <TableCell className="font-medium">
                        {setor.nome}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {setor.tipo || "—"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground">
                        {setor.descricao || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={setor.ativo ? "outline" : "secondary"}>
                          {setor.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Ações para ${setor.nome}`}
                              />
                            }
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => setDetalhe(setor.id)}
                            >
                              <Eye /> Detalhes
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => abrirFormulario(setor)}
                            >
                              <Pencil /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => void alternarAtivo(setor)}
                            >
                              {setor.ativo ? (
                                "Inativar"
                              ) : (
                                <>
                                  <Undo2 /> Reativar
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setExcluindo(setor)}
                            >
                              <Trash2 /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <Empty className="py-12">
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Waypoints />
                          </EmptyMedia>
                          <EmptyTitle>
                            {filtrando
                              ? "Nenhum setor encontrado"
                              : "Cadastre o primeiro setor"}
                          </EmptyTitle>
                          <EmptyDescription>
                            {filtrando
                              ? "Tente outra busca ou outro filtro de status."
                              : "Setores são os locais/etapas da produção (ex.: Corte, Costura, Acabamento) usados para montar os fluxos de produção."}
                          </EmptyDescription>
                        </EmptyHeader>
                        {!filtrando && (
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

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {paginacao?.total ?? 0}{" "}
              {paginacao?.total === 1 ? "setor" : "setores"}
            </p>
            <div className="flex items-center gap-2">
              <span className="mr-2 text-sm text-muted-foreground">
                Página {pagina} de {totalPaginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina <= 1 || carregando}
                onClick={() => setPagina(pagina - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= totalPaginas || carregando}
                onClick={() => setPagina(pagina + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </div>
      )}

      {formulario && (
        <FormularioSetor
          key={formulario === "novo" ? "novo" : formulario.id}
          setor={formulario === "novo" ? null : formulario}
          onClose={() => setFormulario(null)}
          onSaved={recarregar}
          returnFocus={() => {
            const elemento = focoAnterior.current
            if (elemento?.isConnected) elemento.focus()
            else novoRef.current?.focus()
          }}
        />
      )}

      {detalhe !== null && (
        <DialogoDetalheSetor id={detalhe} onClose={() => setDetalhe(null)} />
      )}

      <AlertDialog
        open={!!excluindo}
        onOpenChange={(aberto) => {
          if (!aberto && !processandoExclusao) setExcluindo(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir setor?</AlertDialogTitle>
            <AlertDialogDescription>
              “{excluindo?.nome}” será excluído definitivamente. Setores
              vinculados a um fluxo de produção não podem ser excluídos; nesse
              caso, inative-o ou remova o vínculo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processandoExclusao}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={processandoExclusao}
              onClick={(evento) => {
                evento.preventDefault()
                void confirmarExclusao()
              }}
            >
              {processandoExclusao ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

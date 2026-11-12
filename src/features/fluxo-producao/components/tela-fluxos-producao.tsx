"use client"

import Link from "next/link"
import {
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Undo2,
  Workflow,
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
import { filtrarFluxos } from "../regras-api"
import type { FiltroStatus, Fluxo, Paginacao, Setor } from "../tipos"
import { FormularioFluxo } from "./formulario-fluxo"
import { CaminhoDoFluxo } from "./visualizador-fluxo"

const endpointFluxos = "/api/fluxos-producao"
const endpointSetores = "/api/setores"
const limitePorPagina = 10
// Máximo aceito pela API em uma única chamada.
const limiteApi = 100

type Requisitar = (url: string, init?: RequestInit) => Promise<Response>

/** Lê todas as páginas de uma listagem da API (chave: "fluxos" ou "setores"). */
async function carregarTodos<T>(
  requisitar: Requisitar,
  endpoint: string,
  chave: "fluxos" | "setores",
): Promise<T[]> {
  const todos: T[] = []
  let pagina = 1
  let totalPaginas = 1
  do {
    const resposta = await requisitar(
      `${endpoint}?pagina=${pagina}&limite=${limiteApi}`,
    )
    if (!resposta.ok) throw new Error(await mensagemErro(resposta))
    const corpo = (await resposta.json()) as {
      paginacao: Paginacao
    } & Record<string, unknown>
    todos.push(...(corpo[chave] as T[]))
    totalPaginas = corpo.paginacao.totalPaginas
    pagina += 1
  } while (pagina <= totalPaginas)
  return todos
}

export function TelaFluxosProducao() {
  const {
    estado: estadoAutenticacao,
    empresas,
    empresa,
    selecionarEmpresa,
    requisitar,
  } = useAutenticacao()
  const [fluxos, setFluxos] = useState<Fluxo[]>([])
  const [setores, setSetores] = useState<Setor[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState("")
  // Os setores só são necessários para criar/editar; a lista de fluxos não
  // depende deles, então o carregamento e o erro de cada um são separados.
  const [setoresStatus, setSetoresStatus] = useState<
    "carregando" | "ok" | "erro"
  >("carregando")
  const [erroSetores, setErroSetores] = useState("")
  const [busca, setBusca] = useState("")
  const [status, setStatus] = useState<FiltroStatus>("todos")
  const [pagina, setPagina] = useState(0)
  // "novo" abre o cadastro; um Fluxo abre a edição dele; null fecha.
  const [dialogo, setDialogo] = useState<"novo" | Fluxo | null>(null)
  const [excluindo, setExcluindo] = useState<Fluxo | null>(null)
  const [processando, setProcessando] = useState(false)
  const versaoRequisicao = useRef(0)
  const empresaCarregada = useRef<number | null>(null)

  const recarregar = useCallback(async () => {
    if (!empresa) return
    const versaoAtual = ++versaoRequisicao.current
    setCarregando(true)
    // allSettled: se os setores falharem, a lista de fluxos continua valendo.
    const [resultadoFluxos, resultadoSetores] = await Promise.allSettled([
      carregarTodos<Fluxo>(requisitar, endpointFluxos, "fluxos"),
      carregarTodos<Setor>(requisitar, endpointSetores, "setores"),
    ])
    if (versaoAtual !== versaoRequisicao.current) return

    if (resultadoFluxos.status === "fulfilled") {
      setFluxos(resultadoFluxos.value)
      setErro("")
    } else {
      setErro(
        resultadoFluxos.reason instanceof Error
          ? resultadoFluxos.reason.message
          : "Não foi possível carregar os fluxos de produção.",
      )
    }

    if (resultadoSetores.status === "fulfilled") {
      setSetores(resultadoSetores.value)
      setSetoresStatus("ok")
      setErroSetores("")
    } else {
      // Nunca deixa setores antigos (de outra empresa ou de antes da falha).
      setSetores([])
      setSetoresStatus("erro")
      setErroSetores(
        resultadoSetores.reason instanceof Error
          ? resultadoSetores.reason.message
          : "Não foi possível carregar os setores.",
      )
    }
    setCarregando(false)
  }, [empresa, requisitar])

  useEffect(() => {
    if (estadoAutenticacao !== "autenticado" || !empresa) return
    const idEmpresa = empresa.id
    void Promise.resolve().then(() => {
      // Ao trocar de empresa, descarta tudo o que era da anterior e bloqueia
      // criar/editar até os setores da nova empresa chegarem.
      if (empresaCarregada.current !== idEmpresa) {
        empresaCarregada.current = idEmpresa
        setFluxos([])
        setSetores([])
        setSetoresStatus("carregando")
        setErroSetores("")
        setErro("")
        setDialogo(null)
        setExcluindo(null)
      }
      return recarregar()
    })
  }, [empresa, estadoAutenticacao, recarregar])

  const filtrados = useMemo(
    () => filtrarFluxos(fluxos, busca, status),
    [fluxos, busca, status],
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

  async function alternarAtivo(fluxo: Fluxo) {
    setProcessando(true)
    try {
      const resposta = await requisitar(`${endpointFluxos}/${fluxo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !fluxo.ativo }),
      })
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success(
        fluxo.ativo ? "Fluxo de produção inativado." : "Fluxo reativado.",
      )
      await recarregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error
          ? causa.message
          : "Não foi possível alterar o fluxo.",
      )
    } finally {
      setProcessando(false)
    }
  }

  async function excluir() {
    if (!excluindo) return
    setProcessando(true)
    try {
      const resposta = await requisitar(`${endpointFluxos}/${excluindo.id}`, {
        method: "DELETE",
      })
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success("Fluxo de produção excluído.")
      setExcluindo(null)
      await recarregar()
    } catch (causa) {
      // Ex.: 409 "O fluxo está em uso por ordens em andamento."
      toast.error(
        causa instanceof Error ? causa.message : "Não foi possível excluir.",
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
      titulo="Fluxos de produção"
      descricao="Sequência de setores pela qual uma peça passa durante a produção."
      acoes={
        <Button
          onClick={() => setDialogo("novo")}
          disabled={!empresa || setoresStatus !== "ok"}
        >
          <Plus /> Novo fluxo
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
          aria-label="Carregando fluxos de produção"
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
            Entre na sua conta para gerenciar os fluxos de produção.{" "}
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
            Selecione uma empresa para gerenciar os fluxos de produção.
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
          {setoresStatus === "erro" && (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="space-y-3">
                <p>
                  Não foi possível carregar os setores ({erroSetores}). Você
                  ainda vê os fluxos, mas criar e editar ficam bloqueados até os
                  setores carregarem.
                </p>
                <Button variant="outline" onClick={() => void recarregar()}>
                  Tentar novamente
                </Button>
              </AlertDescription>
            </Alert>
          )}
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
                aria-label="Buscar fluxos de produção"
                className="pl-9"
                placeholder="Buscar por nome, descrição ou setor..."
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
                {carregando ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="h-32 text-center text-muted-foreground"
                    >
                      Carregando fluxos de produção…
                    </TableCell>
                  </TableRow>
                ) : visiveis.length ? (
                  visiveis.map((fluxo) => (
                    <TableRow key={fluxo.id}>
                      <TableCell className="align-top font-medium">
                        <p>{fluxo.nome}</p>
                        {fluxo.descricao && (
                          <p className="text-xs font-normal text-muted-foreground">
                            {fluxo.descricao}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <CaminhoDoFluxo setores={fluxo.setores} />
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={fluxo.ativo ? "outline" : "secondary"}>
                          {fluxo.ativo ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="align-top">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Ações de ${fluxo.nome}`}
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
                                disabled={setoresStatus !== "ok"}
                                onClick={() => setDialogo(fluxo)}
                              >
                                <Pencil /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => void alternarAtivo(fluxo)}
                              >
                                {fluxo.ativo ? (
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
                                onClick={() => setExcluindo(fluxo)}
                              >
                                <Trash2 /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
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
                              : "Um fluxo define a sequência de setores (ex.: Sublimação → Corte → Costura → Aprontamento) que uma peça deve seguir."}
                          </EmptyDescription>
                        </EmptyHeader>
                        {!fluxos.length && (
                          <Button
                            variant="outline"
                            disabled={setoresStatus !== "ok"}
                            onClick={() => setDialogo("novo")}
                          >
                            <Plus /> Cadastrar fluxo
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
              {filtrados.length
                ? `${paginaAtual * limitePorPagina + 1}–${Math.min((paginaAtual + 1) * limitePorPagina, filtrados.length)} de ${filtrados.length} fluxos`
                : "0 fluxos"}
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
        <FormularioFluxo
          key={dialogo === "novo" ? "novo" : dialogo.id}
          fluxo={dialogo === "novo" ? null : dialogo}
          setores={setores}
          onClose={() => setDialogo(null)}
          onSaved={recarregar}
        />
      )}

      <AlertDialog
        open={!!excluindo}
        onOpenChange={(aberto) => {
          if (!aberto && !processando) setExcluindo(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fluxo de produção?</AlertDialogTitle>
            <AlertDialogDescription>
              “{excluindo?.nome}” será excluído e deixará de estar associado aos
              produtos. Ordens de produção já criadas mantêm o histórico. Se
              houver ordens em andamento usando este fluxo, a exclusão será
              recusada — nesse caso, prefira inativar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processando}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={processando}
              onClick={() => void excluir()}
            >
              {processando ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

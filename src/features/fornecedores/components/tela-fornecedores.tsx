"use client"

import Link from "next/link"
import {
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
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
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { filtrarFornecedores, formatarCnpj } from "../regras"
import type { Fornecedor, RespostaPaginada } from "../tipos"
import { FormularioFornecedor } from "./formulario-fornecedor"

const endpoint = "/api/fornecedores"
const limitePorPagina = 10
// Máximo aceito pela API em uma única chamada.
const limiteApi = 100

function badgeStatus(status: string) {
  return (
    <Badge variant={status === "INATIVO" ? "secondary" : "outline"}>
      {status === "INATIVO" ? "Inativo" : "Ativo"}
    </Badge>
  )
}

export function TelaFornecedores() {
  const {
    estado: estadoAutenticacao,
    empresas,
    empresa,
    selecionarEmpresa,
    requisitar,
  } = useAutenticacao()
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState("")
  const [busca, setBusca] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("todos")
  const [pagina, setPagina] = useState(0)
  // "novo" abre o cadastro; um Fornecedor abre a edição dele; null fecha.
  const [dialogo, setDialogo] = useState<"novo" | Fornecedor | null>(null)
  const [inativando, setInativando] = useState<Fornecedor | null>(null)
  const [inativandoRegistro, setInativandoRegistro] = useState(false)
  const versaoRequisicao = useRef(0)

  // A API de fornecedores filtra por igualdade (razão social / nome fantasia),
  // não por "contém". Por isso carregamos todas as páginas da empresa (100 por
  // chamada) e a busca por texto é feita aqui, no navegador.
  const recarregar = useCallback(async () => {
    if (!empresa) return
    const versaoAtual = ++versaoRequisicao.current
    setCarregando(true)
    try {
      const todos: Fornecedor[] = []
      let paginaAtual = 1
      let totalPaginas = 1
      do {
        const parametros = new URLSearchParams({
          id_empresa: String(empresa.id),
          page: String(paginaAtual),
          limit: String(limiteApi),
        })
        if (filtroStatus !== "todos") parametros.set("status", filtroStatus)
        const resposta = await requisitar(`${endpoint}?${parametros}`)
        if (!resposta.ok) throw new Error(await mensagemErro(resposta))
        const corpo = (await resposta.json()) as { data: RespostaPaginada }
        todos.push(...corpo.data.rows)
        totalPaginas = corpo.data.totalPages
        paginaAtual += 1
      } while (paginaAtual <= totalPaginas)
      if (versaoAtual !== versaoRequisicao.current) return
      setFornecedores(todos)
      setErro("")
    } catch (causa) {
      if (versaoAtual !== versaoRequisicao.current) return
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível carregar os fornecedores.",
      )
    } finally {
      if (versaoAtual === versaoRequisicao.current) setCarregando(false)
    }
  }, [empresa, filtroStatus, requisitar])

  useEffect(() => {
    if (estadoAutenticacao !== "autenticado" || !empresa) return
    void Promise.resolve().then(recarregar)
  }, [empresa, estadoAutenticacao, recarregar])

  const filtrados = useMemo(
    () => filtrarFornecedores(fornecedores, busca),
    [busca, fornecedores],
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
  const possuiFiltros = busca || filtroStatus !== "todos"

  const abrirNovo = () => setDialogo("novo")
  const abrirEdicao = (item: Fornecedor) => setDialogo(item)

  async function inativar() {
    if (!inativando) return
    setInativandoRegistro(true)
    try {
      const resposta = await requisitar(`${endpoint}/${inativando.id}`, {
        method: "DELETE",
      })
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success("Fornecedor inativado.")
      setInativando(null)
      await recarregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error ? causa.message : "Não foi possível inativar.",
      )
    } finally {
      setInativandoRegistro(false)
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
      titulo="Fornecedores"
      descricao="Cadastre e consulte os fornecedores da empresa."
      acoes={
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            render={<Link href="/cadastros/empresa-fornecedor" />}
          >
            Condições comerciais
          </Button>
          <Button onClick={abrirNovo} disabled={!empresa}>
            <Plus /> Novo fornecedor
          </Button>
        </div>
      }
    />
  )

  if (estadoAutenticacao === "carregando")
    return (
      <>
        {cabecalho}
        <Skeleton
          role="status"
          aria-label="Carregando fornecedores"
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
            Entre na sua conta para gerenciar fornecedores.{" "}
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
            Selecione uma empresa para gerenciar fornecedores.
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
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-md">
              <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                aria-label="Buscar fornecedores"
                className="pl-9"
                placeholder="Buscar por razão social, fantasia, CNPJ ou e-mail..."
                value={busca}
                onChange={(evento) => {
                  setBusca(evento.target.value)
                  setPagina(0)
                }}
              />
            </div>
            <SearchSelect
              value={filtroStatus}
              onValueChange={(valor) => {
                setFiltroStatus(valor || "todos")
                setPagina(0)
              }}
              label="Filtrar por situação"
              className="w-full sm:w-56"
              options={[
                { value: "todos", label: "Todas as situações" },
                { value: "ATIVO", label: "Ativos" },
                { value: "INATIVO", label: "Inativos" },
              ]}
            />
            {possuiFiltros && (
              <Button
                variant="ghost"
                onClick={() => {
                  setBusca("")
                  setFiltroStatus("todos")
                  setPagina(0)
                }}
              >
                Limpar filtros
              </Button>
            )}
          </div>

          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razão social</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Cidade / UF</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-32 text-center text-muted-foreground"
                    >
                      Carregando fornecedores…
                    </TableCell>
                  </TableRow>
                ) : visiveis.length ? (
                  visiveis.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="font-medium">{item.razao_social}</div>
                        {item.nome_fantasia && (
                          <div className="text-xs text-muted-foreground">
                            {item.nome_fantasia}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">
                        {formatarCnpj(item.cnpj)}
                      </TableCell>
                      <TableCell>
                        <div>{item.email || "—"}</div>
                        {item.telefone && (
                          <div className="text-xs text-muted-foreground">
                            {item.telefone}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {[item.cidade, item.estado]
                          .filter(Boolean)
                          .join(" / ") || "—"}
                      </TableCell>
                      <TableCell>{badgeStatus(item.status)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Ações de ${item.razao_social}`}
                              />
                            }
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Ações</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => abrirEdicao(item)}
                              >
                                <Pencil /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={item.status === "INATIVO"}
                                onClick={() => setInativando(item)}
                              >
                                <Trash2 /> Inativar
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-40">
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Truck />
                          </EmptyMedia>
                          <EmptyTitle>Nenhum fornecedor encontrado</EmptyTitle>
                          <EmptyDescription>
                            {possuiFiltros
                              ? "Altere os filtros para visualizar outros fornecedores."
                              : "Cadastre o primeiro fornecedor para começar."}
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
                ? `${paginaAtual * limitePorPagina + 1}–${Math.min((paginaAtual + 1) * limitePorPagina, filtrados.length)} de ${filtrados.length} fornecedores`
                : "0 fornecedores"}
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

      {dialogo && empresa && (
        <FormularioFornecedor
          fornecedor={dialogo === "novo" ? null : dialogo}
          idEmpresa={empresa.id}
          onClose={() => setDialogo(null)}
          onSaved={recarregar}
        />
      )}

      <AlertDialog
        open={!!inativando}
        onOpenChange={(aberto) => {
          if (!aberto && !inativandoRegistro) setInativando(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              “{inativando?.razao_social}” deixará de estar disponível para
              novos cadastros. Os vínculos e o histórico serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={inativandoRegistro}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={inativandoRegistro}
              onClick={() => void inativar()}
            >
              {inativandoRegistro ? "Inativando…" : "Inativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

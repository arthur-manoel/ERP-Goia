"use client"

import Link from "next/link"
import {
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
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
import { filtrarTiposProduto } from "../regras"
import type { RespostaPaginada, TipoProduto } from "../tipos"
import { FormularioTipoProduto } from "./formulario-tipo-produto"

const endpoint = "/api/tipos_produto"
const limitePorPagina = 10
// Máximo aceito pela API em uma única chamada.
const limiteApi = 100

export function TelaTiposProduto() {
  // Tipos de produto são compartilhados entre empresas, mas a API só responde a
  // quem tem vínculo ativo com uma empresa (e permissão em produtos), e o
  // requisitar() envia a empresa ativa. Por isso a tela pede a empresa.
  const {
    estado: estadoAutenticacao,
    empresas,
    empresa,
    selecionarEmpresa,
    requisitar,
  } = useAutenticacao()
  const [tipos, setTipos] = useState<TipoProduto[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState("")
  const [busca, setBusca] = useState("")
  const [pagina, setPagina] = useState(0)
  // "novo" abre o cadastro; um TipoProduto abre a edição dele; null fecha.
  const [dialogo, setDialogo] = useState<"novo" | TipoProduto | null>(null)
  const [inativando, setInativando] = useState<TipoProduto | null>(null)
  const [inativandoRegistro, setInativandoRegistro] = useState(false)
  const versaoRequisicao = useRef(0)

  // A API só devolve tipos ativos e filtra o nome por igualdade, não por
  // "contém". Como são poucos registros, carregamos todas as páginas (100 por
  // chamada) e a busca por texto é feita no navegador.
  const recarregar = useCallback(async () => {
    if (!empresa) return
    const versaoAtual = ++versaoRequisicao.current
    setCarregando(true)
    try {
      const todos: TipoProduto[] = []
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
      setTipos(todos)
      setErro("")
    } catch (causa) {
      if (versaoAtual !== versaoRequisicao.current) return
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível carregar os tipos de produto.",
      )
    } finally {
      if (versaoAtual === versaoRequisicao.current) setCarregando(false)
    }
  }, [empresa, requisitar])

  useEffect(() => {
    if (estadoAutenticacao !== "autenticado" || !empresa) return
    void Promise.resolve().then(recarregar)
  }, [empresa, estadoAutenticacao, recarregar])

  const filtrados = useMemo(
    () => filtrarTiposProduto(tipos, busca),
    [busca, tipos],
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
    setInativandoRegistro(true)
    try {
      const resposta = await requisitar(`${endpoint}/${inativando.id}`, {
        method: "DELETE",
      })
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success("Tipo de produto inativado.")
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
      titulo="Tipos de produto"
      descricao="Tipos de produto (compartilhados entre empresas)."
      acoes={
        <Button onClick={() => setDialogo("novo")} disabled={!empresa}>
          <Plus /> Novo tipo
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
          aria-label="Carregando tipos de produto"
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
            Entre na sua conta para gerenciar tipos de produto.{" "}
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
            Selecione uma empresa para gerenciar tipos de produto.
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
                aria-label="Buscar tipos de produto"
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
                  <TableHead>
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {carregando ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="h-32 text-center text-muted-foreground"
                    >
                      Carregando tipos de produto…
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
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Ações de ${item.nome}`}
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
                              <DropdownMenuItem
                                variant="destructive"
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
                    <TableCell colSpan={3} className="h-40">
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Tags />
                          </EmptyMedia>
                          <EmptyTitle>
                            Nenhum tipo de produto encontrado
                          </EmptyTitle>
                          <EmptyDescription>
                            {busca
                              ? "Altere a busca para ver outros tipos."
                              : "Cadastre o primeiro tipo de produto para começar."}
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
                ? `${paginaAtual * limitePorPagina + 1}–${Math.min((paginaAtual + 1) * limitePorPagina, filtrados.length)} de ${filtrados.length} tipos`
                : "0 tipos"}
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
        <FormularioTipoProduto
          tipo={dialogo === "novo" ? null : dialogo}
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
            <AlertDialogTitle>Inativar tipo de produto?</AlertDialogTitle>
            <AlertDialogDescription>
              “{inativando?.nome}” deixará de aparecer na lista e de estar
              disponível para novos cadastros. Os produtos e o histórico
              vinculados serão preservados.
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

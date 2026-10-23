"use client"

import { useMemo, useRef, useState } from "react"
import { MoreHorizontal, Pencil, Plus, Search, Tags, Undo2 } from "lucide-react"
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
import { FormularioCategoria } from "./formulario-categoria"

type FiltroStatus = "todas" | "ATIVA" | "INATIVA"

export type TelaCategoriasProps = {
  /** null: dados ainda não conectados; []: consulta concluída sem categorias. */
  categorias?: Categoria[] | null
  carregando?: boolean
  erro?: string | null
  onRecarregar?: () => void
  /** A integração deve atualizar a lista após resolver esta ação. */
  onSalvar?: (
    dados: DadosCategoria,
    idEmpresa: number,
    categoria?: Categoria,
  ) => Promise<void>
  onAlterarStatus?: (categoria: Categoria, idEmpresa: number) => Promise<void>
}

export function TelaCategorias({
  categorias = null,
  carregando = false,
  erro,
  onRecarregar,
  onSalvar,
  onAlterarStatus,
}: TelaCategoriasProps) {
  const { empresa, empresas, selecionarEmpresa } = useAutenticacao()
  const [busca, setBusca] = useState("")
  const [status, setStatus] = useState<FiltroStatus>("todas")
  const [formulario, setFormulario] = useState<"novo" | Categoria | null>(null)
  const [alterando, setAlterando] = useState<Categoria | null>(null)
  const [pendente, setPendente] = useState(false)
  const [erroAcao, setErroAcao] = useState("")
  const botaoNovo = useRef<HTMLButtonElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)

  const filtradas = useMemo(() => {
    if (!empresa) return []
    const termo = busca.trim().toLocaleLowerCase("pt-BR")
    return (categorias ?? [])
      .filter((item) => item.id_empresa === empresa.id)
      .filter((item) => status === "todas" || item.status === status)
      .filter((item) => item.nome.toLocaleLowerCase("pt-BR").includes(termo))
      .toSorted((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  }, [busca, categorias, empresa, status])

  function abrirFormulario(categoria?: Categoria) {
    focoAnterior.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setFormulario(categoria ?? "novo")
  }

  async function confirmarAlteracao() {
    if (
      !alterando ||
      !empresa ||
      alterando.id_empresa !== empresa.id ||
      !onAlterarStatus
    )
      return
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

  const semIntegracao = categorias === null
  const filtrado = busca.trim() !== "" || status !== "todas"

  return (
    <>
      <PageHeader
        titulo="Categorias de produto"
        descricao="Organize os produtos do catálogo da empresa."
        acoes={
          <Button
            ref={botaoNovo}
            disabled={!empresa}
            onClick={() => abrirFormulario()}
          >
            <Plus /> Nova categoria
          </Button>
        }
      />

      {empresas.length > 1 && (
        <div className="max-w-sm space-y-2">
          <p className="text-sm font-medium">Empresa</p>
          <SearchSelect
            label="Empresa ativa"
            placeholder="Selecione uma empresa"
            value={empresa ? String(empresa.id) : ""}
            onValueChange={(valor) => {
              setBusca("")
              setStatus("todas")
              setFormulario(null)
              setAlterando(null)
              selecionarEmpresa(Number(valor))
            }}
            options={empresas.map((item) => ({
              value: String(item.id),
              label: item.nome,
            }))}
          />
        </div>
      )}

      {!empresa ? (
        <Alert>
          <AlertDescription>
            Selecione uma empresa para visualizar suas categorias.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {semIntegracao && (
            <Alert>
              <AlertDescription>
                A consulta e o cadastro de categorias estarão disponíveis em
                breve. O formulário já pode ser visualizado.
              </AlertDescription>
            </Alert>
          )}
          {erro && (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="flex flex-wrap items-center gap-3">
                <span>{erro}</span>
                {onRecarregar && (
                  <Button variant="outline" size="sm" onClick={onRecarregar}>
                    Tentar novamente
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
                <Input
                  aria-label="Buscar categorias"
                  className="pl-9"
                  placeholder="Buscar por nome..."
                  value={busca}
                  onChange={(evento) => setBusca(evento.target.value)}
                />
              </div>
              <Tabs
                value={status}
                onValueChange={(valor) => setStatus(valor as FiltroStatus)}
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
                    setStatus("todas")
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
                              categoria.status === "ATIVA"
                                ? "outline"
                                : "secondary"
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
                                disabled={!onAlterarStatus}
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
                              {semIntegracao
                                ? "Categorias indisponíveis"
                                : filtrado
                                  ? "Nenhuma categoria encontrada"
                                  : "Nenhuma categoria cadastrada"}
                            </EmptyTitle>
                            <EmptyDescription>
                              {semIntegracao
                                ? "A listagem aparecerá aqui quando estiver disponível."
                                : filtrado
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
            {!semIntegracao && !carregando && !erro && (
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {filtradas.length}{" "}
                {filtradas.length === 1 ? "categoria" : "categorias"}
              </p>
            )}
          </div>
        </>
      )}

      {formulario && empresa && (
        <FormularioCategoria
          key={formulario === "novo" ? "novo" : formulario.id}
          categoria={formulario === "novo" ? undefined : formulario}
          empresaNome={empresa.nome}
          onClose={() => setFormulario(null)}
          returnFocus={() => {
            if (focoAnterior.current?.isConnected) focoAnterior.current.focus()
            else botaoNovo.current?.focus()
          }}
          onSalvar={
            onSalvar
              ? (dados, categoria) => onSalvar(dados, empresa.id, categoria)
              : undefined
          }
        />
      )}

      <AlertDialog
        open={!!alterando}
        onOpenChange={(aberto) => {
          if (!aberto && !pendente) setAlterando(null)
        }}
      >
        <AlertDialogContent>
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
            <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
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
    </>
  )
}

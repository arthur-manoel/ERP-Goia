"use client"

import Link from "next/link"
import {
  ArrowUpDown,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Ruler,
  Search,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
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

type TipoVariacao = "cor" | "tamanho"
type Registro = {
  id: number
  nome: string
  status: string
  codigo_hex?: string | null
  descricao?: string | null
  ordem?: number
}
type Formulario = {
  id?: number
  nome: string
  status: string
  codigoHex: string
  descricao: string
  ordem: string
}

const normalizar = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

const configuracoes = {
  cor: {
    titulo: "Cores",
    singular: "Cor",
    descricao: "Cadastre as cores usadas nas variações de produto.",
    endpoint: "/api/cores",
    statusAtivo: "ATIVA",
    statusInativo: "INATIVA",
    atualizacao: "atualizada",
    cadastro: "cadastrada",
    inativacao: "inativada",
  },
  tamanho: {
    titulo: "Tamanhos",
    singular: "Tamanho",
    descricao: "Cadastre os tamanhos usados nas variações de produto.",
    endpoint: "/api/tamanhos",
    statusAtivo: "ATIVO",
    statusInativo: "INATIVO",
    atualizacao: "atualizado",
    cadastro: "cadastrado",
    inativacao: "inativado",
  },
} as const

function novoFormulario(tipo: TipoVariacao): Formulario {
  return {
    nome: "",
    status: configuracoes[tipo].statusAtivo,
    codigoHex: "",
    descricao: "",
    ordem: "0",
  }
}

function badgeStatus(status: string) {
  return (
    <Badge
      variant={
        status.endsWith("INATIVA") || status === "INATIVO"
          ? "secondary"
          : "outline"
      }
    >
      {status === "ATIVA" || status === "ATIVO" ? "Ativo" : "Inativo"}
    </Badge>
  )
}

export function TelaVariacoes({ tipo }: { tipo: TipoVariacao }) {
  const configuracao = configuracoes[tipo]
  const {
    estado: estadoAutenticacao,
    empresas,
    empresa,
    selecionarEmpresa,
    requisitar,
  } = useAutenticacao()
  const [registros, setRegistros] = useState<Registro[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState("")
  const [busca, setBusca] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("todos")
  const [ordemCrescente, setOrdemCrescente] = useState(true)
  const [pagina, setPagina] = useState(0)
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const [erroFormulario, setErroFormulario] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState<Registro | null>(null)
  const [excluindoRegistro, setExcluindoRegistro] = useState(false)

  const recarregar = useCallback(async () => {
    if (!empresa) return
    setCarregando(true)
    try {
      const parametros = new URLSearchParams({
        id_empresa: String(empresa.id),
        page: "1",
        limit: "100",
      })
      const resposta = await requisitar(
        `${configuracao.endpoint}?${parametros.toString()}`,
      )
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      const corpo = (await resposta.json()) as {
        data: { rows: Registro[] }
      }
      setRegistros(corpo.data.rows)
      setErro("")
    } catch (causa) {
      setErro(
        causa instanceof Error
          ? causa.message
          : `Não foi possível carregar ${configuracao.titulo.toLowerCase()}.`,
      )
    } finally {
      setCarregando(false)
    }
  }, [configuracao.endpoint, configuracao.titulo, empresa, requisitar])

  useEffect(() => {
    if (estadoAutenticacao !== "autenticado" || !empresa) return

    void Promise.resolve().then(recarregar)
  }, [empresa, estadoAutenticacao, recarregar])

  const filtrados = useMemo(() => {
    const termo = normalizar(busca)
    return registros
      .filter((registro) =>
        filtroStatus === "todos" ? true : registro.status === filtroStatus,
      )
      .filter((registro) =>
        normalizar(
          `${registro.nome} ${registro.codigo_hex ?? ""} ${registro.descricao ?? ""}`,
        ).includes(termo),
      )
      .sort((primeiro, segundo) => {
        const resultado = primeiro.nome.localeCompare(segundo.nome, "pt-BR")
        return ordemCrescente ? resultado : -resultado
      })
  }, [busca, filtroStatus, ordemCrescente, registros])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / 10))
  const paginaSegura = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtrados.slice(paginaSegura * 10, paginaSegura * 10 + 10)
  const possuiFiltros = busca || filtroStatus !== "todos"

  function abrirNovo() {
    setErroFormulario("")
    setFormulario(novoFormulario(tipo))
  }

  function abrirEdicao(registro: Registro) {
    setErroFormulario("")
    setFormulario({
      id: registro.id,
      nome: registro.nome,
      status: registro.status,
      codigoHex: registro.codigo_hex ?? "",
      descricao: registro.descricao ?? "",
      ordem: String(registro.ordem ?? 0),
    })
  }

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!formulario || !empresa) return
    const nome = formulario.nome.trim()
    if (!nome) {
      setErroFormulario("Informe o nome.")
      return
    }
    if (
      tipo === "cor" &&
      formulario.codigoHex &&
      !/^#[0-9A-Fa-f]{6}$/.test(formulario.codigoHex)
    ) {
      setErroFormulario("Informe a cor no formato #RRGGBB.")
      return
    }
    if (tipo === "tamanho" && !Number.isInteger(Number(formulario.ordem))) {
      setErroFormulario("A ordem deve ser um número inteiro.")
      return
    }

    const dados =
      tipo === "cor"
        ? {
            ...(formulario.id ? {} : { id_empresa: empresa.id }),
            nome,
            codigo_hex: formulario.codigoHex
              ? formulario.codigoHex.toUpperCase()
              : null,
            status: formulario.status,
          }
        : {
            ...(formulario.id ? {} : { id_empresa: empresa.id }),
            nome,
            descricao: formulario.descricao.trim() || null,
            ordem: Number(formulario.ordem),
            status: formulario.status,
          }

    setSalvando(true)
    setErroFormulario("")
    try {
      const resposta = await requisitar(
        formulario.id
          ? `${configuracao.endpoint}/${formulario.id}`
          : configuracao.endpoint,
        {
          method: formulario.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dados),
        },
      )
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success(
        formulario.id
          ? `${configuracao.singular} ${configuracao.atualizacao}.`
          : `${configuracao.singular} ${configuracao.cadastro}.`,
      )
      setFormulario(null)
      await recarregar()
    } catch (causa) {
      setErroFormulario(
        causa instanceof Error ? causa.message : "Não foi possível salvar.",
      )
    } finally {
      setSalvando(false)
    }
  }

  async function excluir() {
    if (!excluindo) return
    setExcluindoRegistro(true)
    try {
      const resposta = await requisitar(
        `${configuracao.endpoint}/${excluindo.id}`,
        {
          method: "DELETE",
        },
      )
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success(`${configuracao.singular} ${configuracao.inativacao}.`)
      setExcluindo(null)
      await recarregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error ? causa.message : "Não foi possível excluir.",
      )
    } finally {
      setExcluindoRegistro(false)
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
      titulo={configuracao.titulo}
      descricao={configuracao.descricao}
      acoes={
        <Button onClick={abrirNovo} disabled={!empresa}>
          <Plus /> Novo {configuracao.singular.toLowerCase()}
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
          aria-label={`Carregando ${configuracao.titulo.toLowerCase()}`}
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
            Entre na sua conta para gerenciar{" "}
            {configuracao.titulo.toLowerCase()}.{" "}
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
            Selecione uma empresa para gerenciar{" "}
            {configuracao.titulo.toLowerCase()}.
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
                aria-label={`Buscar ${configuracao.titulo.toLowerCase()}`}
                className="pl-9"
                placeholder={`Buscar por nome${tipo === "cor" ? " ou código hexadecimal" : " ou descrição"}...`}
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
                { value: configuracao.statusAtivo, label: "Ativos" },
                { value: configuracao.statusInativo, label: "Inativos" },
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
                  <TableHead
                    aria-sort={ordemCrescente ? "ascending" : "descending"}
                  >
                    <Button
                      variant="ghost"
                      className="-ml-3"
                      onClick={() => setOrdemCrescente((valor) => !valor)}
                    >
                      Nome <ArrowUpDown />
                    </Button>
                  </TableHead>
                  {tipo === "cor" ? (
                    <TableHead>Cor</TableHead>
                  ) : (
                    <>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Ordem</TableHead>
                    </>
                  )}
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
                      colSpan={tipo === "cor" ? 4 : 5}
                      className="h-32 text-center text-muted-foreground"
                    >
                      Carregando registros…
                    </TableCell>
                  </TableRow>
                ) : visiveis.length ? (
                  visiveis.map((registro) => (
                    <TableRow key={registro.id}>
                      <TableCell className="font-medium">
                        {registro.nome}
                      </TableCell>
                      {tipo === "cor" ? (
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              aria-label={
                                registro.codigo_hex ?? "Sem código hexadecimal"
                              }
                              className="size-5 rounded-full border shadow-sm"
                              style={{
                                backgroundColor:
                                  registro.codigo_hex ?? "transparent",
                              }}
                            />
                            <span className="font-mono text-xs tabular-nums">
                              {registro.codigo_hex ?? "Não informado"}
                            </span>
                          </div>
                        </TableCell>
                      ) : (
                        <>
                          <TableCell className="max-w-72 truncate text-muted-foreground">
                            {registro.descricao || "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {registro.ordem ?? 0}
                          </TableCell>
                        </>
                      )}
                      <TableCell>{badgeStatus(registro.status)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Ações de ${registro.nome}`}
                              />
                            }
                          >
                            <MoreHorizontal />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Ações</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => abrirEdicao(registro)}
                              >
                                <Pencil /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                disabled={
                                  registro.status === configuracao.statusInativo
                                }
                                onClick={() => setExcluindo(registro)}
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
                    <TableCell
                      colSpan={tipo === "cor" ? 4 : 5}
                      className="h-40"
                    >
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            {tipo === "cor" ? <Palette /> : <Ruler />}
                          </EmptyMedia>
                          <EmptyTitle>Nenhum registro encontrado</EmptyTitle>
                          <EmptyDescription>
                            {possuiFiltros
                              ? "Altere os filtros para visualizar outros registros."
                              : `Cadastre o primeiro ${configuracao.singular.toLowerCase()} para começar.`}
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
                ? `${paginaSegura * 10 + 1}–${Math.min(paginaSegura * 10 + 10, filtrados.length)} de ${filtrados.length} registros`
                : "0 registros"}
            </p>
            <div className="flex items-center gap-2">
              <span className="mr-2 text-sm text-muted-foreground">
                Página {paginaSegura + 1} de {totalPaginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={paginaSegura === 0}
                onClick={() => setPagina(paginaSegura - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={paginaSegura + 1 >= totalPaginas}
                onClick={() => setPagina(paginaSegura + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}

      {formulario && (
        <Dialog
          open
          onOpenChange={(aberto) => {
            if (!aberto && !salvando) setFormulario(null)
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {formulario.id ? "Editar" : "Novo"}{" "}
                {configuracao.singular.toLowerCase()}
              </DialogTitle>
              <DialogDescription>
                {formulario.id
                  ? `Atualize os dados de ${formulario.nome}.`
                  : `Informe os dados para cadastrar um novo ${configuracao.singular.toLowerCase()}.`}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={salvar} className="space-y-5">
              <Field data-invalid={!!erroFormulario}>
                <FieldLabel htmlFor={`${tipo}-nome`}>Nome</FieldLabel>
                <Input
                  id={`${tipo}-nome`}
                  value={formulario.nome}
                  onChange={(evento) =>
                    setFormulario((atual) =>
                      atual ? { ...atual, nome: evento.target.value } : atual,
                    )
                  }
                  aria-invalid={!!erroFormulario}
                  aria-describedby={erroFormulario ? `${tipo}-erro` : undefined}
                  autoFocus
                  disabled={salvando}
                />
              </Field>

              {tipo === "cor" ? (
                <Field>
                  <FieldLabel htmlFor="cor-codigo-hex">
                    Código hexadecimal
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id="cor-codigo-hex"
                      className="font-mono"
                      placeholder="#RRGGBB"
                      value={formulario.codigoHex}
                      onChange={(evento) =>
                        setFormulario((atual) =>
                          atual
                            ? { ...atual, codigoHex: evento.target.value }
                            : atual,
                        )
                      }
                      disabled={salvando}
                    />
                    <Input
                      type="color"
                      aria-label="Selecionar cor"
                      className="h-9 w-12 p-1"
                      value={
                        /^#[0-9A-Fa-f]{6}$/.test(formulario.codigoHex)
                          ? formulario.codigoHex
                          : "#000000"
                      }
                      onChange={(evento) =>
                        setFormulario((atual) =>
                          atual
                            ? {
                                ...atual,
                                codigoHex: evento.target.value.toUpperCase(),
                              }
                            : atual,
                        )
                      }
                      disabled={salvando}
                    />
                  </div>
                </Field>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor="tamanho-descricao">
                      Descrição
                    </FieldLabel>
                    <Input
                      id="tamanho-descricao"
                      value={formulario.descricao}
                      onChange={(evento) =>
                        setFormulario((atual) =>
                          atual
                            ? { ...atual, descricao: evento.target.value }
                            : atual,
                        )
                      }
                      disabled={salvando}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="tamanho-ordem">
                      Ordem de exibição
                    </FieldLabel>
                    <Input
                      id="tamanho-ordem"
                      type="number"
                      step="1"
                      value={formulario.ordem}
                      onChange={(evento) =>
                        setFormulario((atual) =>
                          atual
                            ? { ...atual, ordem: evento.target.value }
                            : atual,
                        )
                      }
                      disabled={salvando}
                    />
                  </Field>
                </>
              )}

              <Field>
                <FieldLabel htmlFor={`${tipo}-status`}>Situação</FieldLabel>
                <SearchSelect
                  id={`${tipo}-status`}
                  value={formulario.status}
                  onValueChange={(valor) =>
                    setFormulario((atual) =>
                      atual ? { ...atual, status: valor } : atual,
                    )
                  }
                  label="Situação"
                  disabled={salvando}
                  options={[
                    { value: configuracao.statusAtivo, label: "Ativo" },
                    { value: configuracao.statusInativo, label: "Inativo" },
                  ]}
                />
              </Field>

              {erroFormulario && (
                <FieldError id={`${tipo}-erro`}>{erroFormulario}</FieldError>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setFormulario(null)}
                  disabled={salvando}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog
        open={!!excluindo}
        onOpenChange={(aberto) => {
          if (!aberto && !excluindoRegistro) setExcluindo(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Inativar {configuracao.singular.toLowerCase()}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              “{excluindo?.nome}” deixará de estar disponível para novos
              cadastros. Os registros existentes serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindoRegistro}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={excluindoRegistro}
              onClick={() => void excluir()}
            >
              {excluindoRegistro ? "Inativando…" : "Inativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

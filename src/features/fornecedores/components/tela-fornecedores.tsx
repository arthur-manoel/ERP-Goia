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

type Fornecedor = {
  id: number
  id_empresa: number | null
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  inscricao_estadual: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  cep: string | null
  telefone: string | null
  email: string | null
  status: string
}

type Formulario = {
  id?: number
  razaoSocial: string
  nomeFantasia: string
  cnpj: string
  inscricaoEstadual: string
  email: string
  telefone: string
  cep: string
  endereco: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  estado: string
  status: string
}

type RespostaPaginada = {
  rows: Fornecedor[]
  count: number
  totalPages: number
}

const endpoint = "/api/fornecedores"
const limitePorPagina = 10
// Máximo aceito pela API em uma única chamada.
const limiteApi = 100

// Mesmo formato aceito pela API: 12 caracteres + 2 dígitos, com ou sem máscara.
const formatoCnpj =
  /^(?:[A-Z0-9]{12}\d{2}|[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2})$/
const formatoEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const estados = [
  ["AC", "Acre"],
  ["AL", "Alagoas"],
  ["AP", "Amapá"],
  ["AM", "Amazonas"],
  ["BA", "Bahia"],
  ["CE", "Ceará"],
  ["DF", "Distrito Federal"],
  ["ES", "Espírito Santo"],
  ["GO", "Goiás"],
  ["MA", "Maranhão"],
  ["MT", "Mato Grosso"],
  ["MS", "Mato Grosso do Sul"],
  ["MG", "Minas Gerais"],
  ["PA", "Pará"],
  ["PB", "Paraíba"],
  ["PR", "Paraná"],
  ["PE", "Pernambuco"],
  ["PI", "Piauí"],
  ["RJ", "Rio de Janeiro"],
  ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"],
  ["RO", "Rondônia"],
  ["RR", "Roraima"],
  ["SC", "Santa Catarina"],
  ["SP", "São Paulo"],
  ["SE", "Sergipe"],
  ["TO", "Tocantins"],
].map(([sigla, nome]) => ({ value: sigla, label: `${sigla} — ${nome}` }))

const formularioVazio: Formulario = {
  razaoSocial: "",
  nomeFantasia: "",
  cnpj: "",
  inscricaoEstadual: "",
  email: "",
  telefone: "",
  cep: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  status: "ATIVO",
}

// A API rejeita string vazia em CNPJ/email: para limpar um campo, envia null.
const textoOuNulo = (valor: string) => valor.trim() || null

function formatarCnpj(valor: string | null) {
  if (!valor) return "—"
  const limpo = valor.replace(/[./-]/g, "").toUpperCase()
  return limpo.length === 14
    ? limpo.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5")
    : valor
}

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
  const [formulario, setFormulario] = useState<Formulario | null>(null)
  const [erroFormulario, setErroFormulario] = useState("")
  const [salvando, setSalvando] = useState(false)
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

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return fornecedores
    const termoCnpj = termo.replace(/[./-]/g, "")
    return fornecedores.filter(
      (item) =>
        item.razao_social.toLowerCase().includes(termo) ||
        (item.nome_fantasia ?? "").toLowerCase().includes(termo) ||
        (item.email ?? "").toLowerCase().includes(termo) ||
        (termoCnpj && (item.cnpj ?? "").toLowerCase().includes(termoCnpj)),
    )
  }, [busca, fornecedores])

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

  function alterar(campo: keyof Formulario, valor: string) {
    setFormulario((atual) => (atual ? { ...atual, [campo]: valor } : atual))
  }

  function abrirNovo() {
    setErroFormulario("")
    setFormulario(formularioVazio)
  }

  function abrirEdicao(item: Fornecedor) {
    setErroFormulario("")
    setFormulario({
      id: item.id,
      razaoSocial: item.razao_social,
      nomeFantasia: item.nome_fantasia ?? "",
      cnpj: formatarCnpj(item.cnpj) === "—" ? "" : formatarCnpj(item.cnpj),
      inscricaoEstadual: item.inscricao_estadual ?? "",
      email: item.email ?? "",
      telefone: item.telefone ?? "",
      cep: item.cep ?? "",
      endereco: item.endereco ?? "",
      numero: item.numero ?? "",
      complemento: item.complemento ?? "",
      bairro: item.bairro ?? "",
      cidade: item.cidade ?? "",
      estado: item.estado ?? "",
      status: item.status,
    })
  }

  async function salvar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!formulario || !empresa) return

    const razaoSocial = formulario.razaoSocial.trim()
    const cnpj = formulario.cnpj.trim().toUpperCase()
    const email = formulario.email.trim()
    const estado = formulario.estado.trim().toUpperCase()

    if (!razaoSocial) return setErroFormulario("Informe a razão social.")
    if (cnpj && !formatoCnpj.test(cnpj))
      return setErroFormulario(
        "CNPJ deve ter 14 caracteres ou usar a máscara XX.XXX.XXX/XXXX-99.",
      )
    if (email && !formatoEmail.test(email))
      return setErroFormulario("Informe um e-mail válido.")
    if (estado && !/^[A-Z]{2}$/.test(estado))
      return setErroFormulario("O estado deve ter duas letras (ex.: GO).")

    const dados = {
      // id_empresa só é enviado na criação; a troca de empresa não é feita aqui.
      ...(formulario.id ? {} : { id_empresa: empresa.id }),
      razao_social: razaoSocial,
      nome_fantasia: textoOuNulo(formulario.nomeFantasia),
      cnpj: cnpj || null,
      inscricao_estadual: textoOuNulo(formulario.inscricaoEstadual),
      email: email || null,
      telefone: textoOuNulo(formulario.telefone),
      cep: textoOuNulo(formulario.cep),
      endereco: textoOuNulo(formulario.endereco),
      numero: textoOuNulo(formulario.numero),
      complemento: textoOuNulo(formulario.complemento),
      bairro: textoOuNulo(formulario.bairro),
      cidade: textoOuNulo(formulario.cidade),
      estado: estado || null,
      status: formulario.status,
    }

    setSalvando(true)
    setErroFormulario("")
    try {
      const resposta = await requisitar(
        formulario.id ? `${endpoint}/${formulario.id}` : endpoint,
        {
          method: formulario.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dados),
        },
      )
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success(
        formulario.id ? "Fornecedor atualizado." : "Fornecedor cadastrado.",
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
        <Button onClick={abrirNovo} disabled={!empresa}>
          <Plus /> Novo fornecedor
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

      {formulario && (
        <Dialog
          open
          onOpenChange={(aberto) => {
            if (!aberto && !salvando) setFormulario(null)
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {formulario.id ? "Editar fornecedor" : "Novo fornecedor"}
              </DialogTitle>
              <DialogDescription>
                {formulario.id
                  ? `Atualize os dados de ${formulario.razaoSocial}.`
                  : "Informe os dados para cadastrar um novo fornecedor."}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={salvar} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="forn-razao">Razão social *</FieldLabel>
                  <Input
                    id="forn-razao"
                    placeholder="Ex.: Empresa Exemplo Ltda"
                    value={formulario.razaoSocial}
                    onChange={(e) => alterar("razaoSocial", e.target.value)}
                    maxLength={150}
                    autoFocus
                    disabled={salvando}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forn-fantasia">Nome fantasia</FieldLabel>
                  <Input
                    id="forn-fantasia"
                    placeholder="Ex.: Exemplo"
                    value={formulario.nomeFantasia}
                    onChange={(e) => alterar("nomeFantasia", e.target.value)}
                    maxLength={150}
                    disabled={salvando}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forn-cnpj">CNPJ</FieldLabel>
                  <Input
                    id="forn-cnpj"
                    placeholder="Ex.: 00.000.000/0001-00"
                    className="font-mono"
                    value={formulario.cnpj}
                    onChange={(e) => alterar("cnpj", e.target.value)}
                    disabled={salvando}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forn-ie">Inscrição estadual</FieldLabel>
                  <Input
                    id="forn-ie"
                    placeholder="Ex.: 000000000"
                    value={formulario.inscricaoEstadual}
                    onChange={(e) =>
                      alterar("inscricaoEstadual", e.target.value)
                    }
                    maxLength={30}
                    disabled={salvando}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forn-status">Situação</FieldLabel>
                  <SearchSelect
                    id="forn-status"
                    value={formulario.status}
                    onValueChange={(valor) => alterar("status", valor)}
                    label="Situação"
                    disabled={salvando}
                    options={[
                      { value: "ATIVO", label: "Ativo" },
                      { value: "INATIVO", label: "Inativo" },
                    ]}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forn-email">E-mail</FieldLabel>
                  <Input
                    id="forn-email"
                    placeholder="Ex.: contato@exemplo.com.br"
                    type="email"
                    value={formulario.email}
                    onChange={(e) => alterar("email", e.target.value)}
                    maxLength={150}
                    disabled={salvando}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forn-telefone">Telefone</FieldLabel>
                  <Input
                    id="forn-telefone"
                    placeholder="Ex.: (00) 0000-0000"
                    value={formulario.telefone}
                    onChange={(e) => alterar("telefone", e.target.value)}
                    maxLength={30}
                    disabled={salvando}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forn-cep">CEP</FieldLabel>
                  <Input
                    id="forn-cep"
                    placeholder="Ex.: 00000-000"
                    value={formulario.cep}
                    onChange={(e) => alterar("cep", e.target.value)}
                    maxLength={10}
                    disabled={salvando}
                  />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="forn-endereco">Endereço</FieldLabel>
                  <Input
                    id="forn-endereco"
                    placeholder="Ex.: Nome da rua ou avenida"
                    value={formulario.endereco}
                    onChange={(e) => alterar("endereco", e.target.value)}
                    maxLength={255}
                    disabled={salvando}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forn-numero">Número</FieldLabel>
                  <Input
                    id="forn-numero"
                    placeholder="Ex.: 123"
                    value={formulario.numero}
                    onChange={(e) => alterar("numero", e.target.value)}
                    maxLength={20}
                    disabled={salvando}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forn-complemento">
                    Complemento
                  </FieldLabel>
                  <Input
                    id="forn-complemento"
                    placeholder="Ex.: Sala, galpão, bloco"
                    value={formulario.complemento}
                    onChange={(e) => alterar("complemento", e.target.value)}
                    maxLength={100}
                    disabled={salvando}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forn-bairro">Bairro</FieldLabel>
                  <Input
                    id="forn-bairro"
                    placeholder="Ex.: Nome do bairro"
                    value={formulario.bairro}
                    onChange={(e) => alterar("bairro", e.target.value)}
                    maxLength={100}
                    disabled={salvando}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forn-cidade">Cidade</FieldLabel>
                  <Input
                    id="forn-cidade"
                    placeholder="Ex.: Nome da cidade"
                    value={formulario.cidade}
                    onChange={(e) => alterar("cidade", e.target.value)}
                    maxLength={100}
                    disabled={salvando}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="forn-estado">Estado (UF)</FieldLabel>
                  <SearchSelect
                    id="forn-estado"
                    value={formulario.estado}
                    onValueChange={(valor) => alterar("estado", valor)}
                    label="Estado (UF)"
                    placeholder="Digite ou escolha a UF"
                    disabled={salvando}
                    options={estados}
                  />
                </Field>
              </div>

              {erroFormulario && (
                <FieldError role="alert">{erroFormulario}</FieldError>
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

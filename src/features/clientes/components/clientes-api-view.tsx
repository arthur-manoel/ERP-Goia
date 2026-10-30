"use client"

import { useCallback, useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { ZodError } from "zod"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import {
  alterarStatusCliente,
  filtrosIniciais,
  listarClientes,
  parametrosClientes,
  type ClienteApi,
  type FiltrosClientes,
} from "../api"
import { formatarDocumento } from "../formatacao"
import { useConsultaCliente } from "../use-consulta"
import { DetalhesClienteApi } from "./detalhes-cliente-api"
import {
  EditarClienteApi,
  FormularioClienteApi,
} from "./formulario-cliente-api"

function SeletorEmpresaClientes() {
  const { empresa, empresas, selecionarEmpresa } = useAutenticacao()
  if (empresas.length < 2) return null
  return (
    <SearchSelect
      value={empresa ? String(empresa.id) : ""}
      onValueChange={(valor) => selecionarEmpresa(Number(valor))}
      label="Empresa ativa"
      placeholder="Selecione uma empresa"
      className="w-full sm:w-80"
      options={empresas.map((item) => ({
        value: String(item.id),
        label: item.nome,
      }))}
    />
  )
}

export function ClientesApiView() {
  const { estado, usuario, empresa, empresas } = useAutenticacao()
  if (estado === "autenticado" && empresa)
    return (
      <ClientesEmpresa
        key={`${usuario?.email}:${empresa.id}`}
        empresa={empresa}
      />
    )
  return (
    <>
      <PageHeader
        titulo="Clientes"
        descricao="Cadastre e consulte os clientes da empresa."
      />
      {estado === "carregando" ? (
        <Skeleton className="h-80 w-full" aria-label="Carregando clientes" />
      ) : (
        <>
          <SeletorEmpresaClientes />
          <Alert>
            <AlertDescription>
              {estado === "anonimo" ? (
                <>
                  Entre na sua conta para consultar clientes.{" "}
                  <Link href="/login" className="underline">
                    Ir para o login
                  </Link>
                </>
              ) : empresas.length ? (
                "Selecione uma empresa para continuar."
              ) : (
                "Seu usuário não possui vínculo ativo com uma empresa."
              )}
            </AlertDescription>
          </Alert>
        </>
      )}
    </>
  )
}

function ClientesEmpresa({
  empresa,
}: {
  empresa: { id: number; nome: string }
}) {
  const { requisitar } = useAutenticacao()
  const [camposBusca, setCamposBusca] = useState(filtrosIniciais)
  const [filtros, setFiltros] = useState(filtrosIniciais)
  const [pagina, setPagina] = useState(1)
  const [revisao, setRevisao] = useState(0)
  const [erroFiltro, setErroFiltro] = useState("")
  const [dialogo, setDialogo] = useState<
    "novo" | { tipo: "editar" | "detalhes"; id: number } | null
  >(null)
  const [situacao, setSituacao] = useState<ClienteApi | null>(null)
  const [alterando, setAlterando] = useState(false)
  const [erroAcao, setErroAcao] = useState("")
  const botaoNovo = useRef<HTMLButtonElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)
  const consultar = useCallback(
    async (signal: AbortSignal) => {
      const dados = await listarClientes(
        requisitar,
        empresa.id,
        filtros,
        pagina,
        signal,
      )
      if (!signal.aborted && pagina > Math.max(1, dados.paginacao.totalPaginas))
        setPagina(Math.max(1, dados.paginacao.totalPaginas))
      return dados
    },
    [requisitar, empresa.id, filtros, pagina],
  )
  const consulta = useConsultaCliente(
    JSON.stringify([filtros, pagina, revisao]),
    consultar,
  )
  const dados = consulta.dados

  function buscar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    try {
      parametrosClientes(camposBusca, 1)
      setFiltros({ ...camposBusca })
      setPagina(1)
      setRevisao((v) => v + 1)
      setErroFiltro("")
    } catch (causa) {
      setErroFiltro(
        causa instanceof ZodError
          ? (causa.issues[0]?.message ?? "Filtro inválido.")
          : "Verifique os filtros.",
      )
    }
  }
  function abrir(valor: NonNullable<typeof dialogo>) {
    focoAnterior.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    setDialogo(valor)
  }
  function retornarFoco() {
    if (focoAnterior.current?.isConnected) focoAnterior.current.focus()
    else botaoNovo.current?.focus()
  }
  function recarregar() {
    setRevisao((v) => v + 1)
  }
  async function confirmarStatus() {
    if (!situacao || alterando) return
    setAlterando(true)
    setErroAcao("")
    try {
      await alterarStatusCliente(requisitar, empresa.id, situacao)
      toast.success(
        situacao.status === "ATIVO"
          ? "Cliente inativado."
          : "Cliente reativado.",
      )
      setSituacao(null)
      recarregar()
    } catch (causa) {
      setErroAcao(
        causa instanceof Error
          ? causa.message
          : "Não foi possível alterar o cliente.",
      )
    } finally {
      setAlterando(false)
    }
  }

  return (
    <>
      <PageHeader
        titulo="Clientes"
        descricao="Cadastre e consulte os clientes da empresa."
        acoes={
          <Button ref={botaoNovo} onClick={() => abrir("novo")}>
            <Plus /> Novo cliente
          </Button>
        }
      />
      <SeletorEmpresaClientes />
      <form onSubmit={buscar} className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field className="w-full sm:min-w-48 sm:flex-1">
            <FieldLabel htmlFor="clientes-busca">
              Nome / razão social
            </FieldLabel>
            <Input
              id="clientes-busca"
              value={camposBusca.nome}
              maxLength={150}
              placeholder="Buscar por nome..."
              onChange={(e) =>
                setCamposBusca((atual) => ({ ...atual, nome: e.target.value }))
              }
            />
          </Field>
          <Field className="w-full sm:w-64">
            <FieldLabel htmlFor="clientes-documento">
              CPF / CNPJ completo
            </FieldLabel>
            <Input
              id="clientes-documento"
              value={camposBusca.cpfCnpj}
              maxLength={20}
              placeholder="Com ou sem máscara"
              onChange={(e) =>
                setCamposBusca((atual) => ({
                  ...atual,
                  cpfCnpj: e.target.value.toUpperCase(),
                }))
              }
              aria-invalid={!!erroFiltro}
              aria-describedby={erroFiltro ? "clientes-filtro-erro" : undefined}
            />
          </Field>
          <Field className="w-full sm:w-44">
            <FieldLabel htmlFor="clientes-status">Situação</FieldLabel>
            <SearchSelect
              id="clientes-status"
              label="Situação dos clientes"
              value={camposBusca.status}
              onValueChange={(valor) =>
                setCamposBusca((atual) => ({
                  ...atual,
                  status: valor as FiltrosClientes["status"],
                }))
              }
              options={[
                { value: "", label: "Todas" },
                { value: "ATIVO", label: "Ativos" },
                { value: "INATIVO", label: "Inativos" },
              ]}
            />
          </Field>
          <Button type="submit">
            <Search /> Buscar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setCamposBusca(filtrosIniciais)
              setFiltros(filtrosIniciais)
              setPagina(1)
              setRevisao((v) => v + 1)
              setErroFiltro("")
            }}
          >
            Limpar filtros
          </Button>
        </div>
        {erroFiltro && (
          <p
            id="clientes-filtro-erro"
            role="alert"
            className="text-sm text-destructive"
          >
            {erroFiltro}
          </p>
        )}
      </form>
      {consulta.erro && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{consulta.erro}</span>
            <Button variant="outline" onClick={recarregar}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome / razão social</TableHead>
              <TableHead>CPF / CNPJ</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Cidade / UF</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {consulta.carregando ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton
                    role="status"
                    aria-label="Carregando clientes"
                    className="h-64 w-full"
                  />
                </TableCell>
              </TableRow>
            ) : consulta.erro ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-32 text-center text-muted-foreground"
                >
                  Não foi possível exibir os clientes.
                </TableCell>
              </TableRow>
            ) : dados?.clientes.length ? (
              dados.clientes.map((cliente) => (
                <TableRow key={cliente.id}>
                  <TableCell className="font-medium">
                    {cliente.nome_razao_social}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {cliente.cpf_cnpj
                      ? cliente.tipoPessoa
                        ? formatarDocumento(
                            cliente.cpf_cnpj,
                            cliente.tipoPessoa === "FISICA" ? "PF" : "PJ",
                          )
                        : cliente.cpf_cnpj
                      : "Não informado"}
                  </TableCell>
                  <TableCell>
                    <div>{cliente.email || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {cliente.telefone || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {[cliente.cidade, cliente.estado]
                      .filter(Boolean)
                      .join(" / ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        cliente.status === "ATIVO" ? "outline" : "secondary"
                      }
                    >
                      {cliente.status === "ATIVO" ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Ações para ${cliente.nome_razao_social}`}
                          />
                        }
                      >
                        <MoreHorizontal />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            abrir({ tipo: "detalhes", id: cliente.id })
                          }
                        >
                          <Eye /> Detalhes e histórico
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            abrir({ tipo: "editar", id: cliente.id })
                          }
                        >
                          <Pencil /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant={
                            cliente.status === "ATIVO"
                              ? "destructive"
                              : "default"
                          }
                          onClick={() => {
                            setErroAcao("")
                            setSituacao(cliente)
                          }}
                        >
                          {cliente.status === "ATIVO" ? "Inativar" : "Reativar"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={6}>
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Users />
                      </EmptyMedia>
                      <EmptyTitle>Nenhum cliente encontrado</EmptyTitle>
                      <EmptyDescription>
                        Altere os filtros ou cadastre um cliente nesta empresa.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {dados && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <p aria-live="polite">
            {dados.paginacao.total}{" "}
            {dados.paginacao.total === 1 ? "cliente" : "clientes"} · Página{" "}
            {pagina} de {Math.max(1, dados.paginacao.totalPaginas)}
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
              disabled={pagina >= dados.paginacao.totalPaginas}
              onClick={() => setPagina(pagina + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
      {dialogo === "novo" && (
        <FormularioClienteApi
          idEmpresa={empresa.id}
          nomeEmpresa={empresa.nome}
          aoFechar={() => setDialogo(null)}
          aoSalvar={recarregar}
          retornarFoco={retornarFoco}
        />
      )}
      {typeof dialogo === "object" && dialogo?.tipo === "editar" && (
        <EditarClienteApi
          key={dialogo.id}
          idCliente={dialogo.id}
          idEmpresa={empresa.id}
          nomeEmpresa={empresa.nome}
          aoFechar={() => setDialogo(null)}
          aoSalvar={recarregar}
          retornarFoco={retornarFoco}
        />
      )}
      {typeof dialogo === "object" && dialogo?.tipo === "detalhes" && (
        <DetalhesClienteApi
          key={dialogo.id}
          idCliente={dialogo.id}
          idEmpresa={empresa.id}
          aoFechar={() => setDialogo(null)}
        />
      )}
      <AlertDialog
        open={!!situacao}
        onOpenChange={(aberto) => {
          if (!aberto && !alterando) setSituacao(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {situacao?.status === "ATIVO"
                ? "Inativar cliente?"
                : "Reativar cliente?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {situacao?.status === "ATIVO"
                ? `O cadastro de ${situacao.nome_razao_social} ficará inativo. Seu histórico será preservado.`
                : `O cadastro de ${situacao?.nome_razao_social} voltará a ficar ativo.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {erroAcao && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{erroAcao}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={alterando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={alterando}
              variant={situacao?.status === "ATIVO" ? "destructive" : "default"}
              onClick={() => void confirmarStatus()}
            >
              {alterando
                ? "Aguarde…"
                : situacao?.status === "ATIVO"
                  ? "Inativar"
                  : "Reativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

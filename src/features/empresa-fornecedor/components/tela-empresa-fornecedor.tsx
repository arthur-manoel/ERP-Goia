"use client"
import Link from "next/link"
import { useCallback, useState } from "react"
import { Link2, Pencil, Search, Truck } from "lucide-react"
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
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
import { useConsultaCliente } from "@/features/clientes/use-consulta"
import { useAtraso } from "@/features/compras/use-lista"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { formatarCnpj } from "@/features/fornecedores/regras"
import {
  inactivate,
  list,
  listUrl,
  save,
  stateOfPage,
  type Row,
  type Tab,
} from "../api"
import { FormularioCondicoes } from "./formulario-condicoes"

const heading = (
  <PageHeader
    titulo="Condições de fornecedores"
    descricao="Gerencie fornecedores globais e negociações exclusivas da empresa ativa."
  />
)
export function TelaEmpresaFornecedor() {
  const { estado, empresa, empresas, selecionarEmpresa } = useAutenticacao()
  return (
    <>
      {heading}
      {estado === "carregando" ? (
        <Skeleton
          role="status"
          aria-label="Carregando sessão"
          className="h-64 w-full"
        />
      ) : estado === "anonimo" ? (
        <Alert>
          <AlertDescription>
            Entre na sua conta para gerenciar fornecedores.{" "}
            <Link href="/login" className="underline">
              Ir para o login
            </Link>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {empresas.length > 1 && (
            <div className="mb-4">
              <SearchSelect
                value={empresa ? String(empresa.id) : ""}
                onValueChange={(v) => selecionarEmpresa(Number(v))}
                label="Empresa ativa"
                className="w-full sm:w-80"
                options={empresas.map((e) => ({
                  value: String(e.id),
                  label: e.nome,
                }))}
              />
            </div>
          )}
          {empresa ? (
            <EmpresaFornecedor key={empresa.id} idEmpresa={empresa.id} />
          ) : (
            <Alert>
              <AlertDescription>
                Selecione a empresa ativa para continuar.
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </>
  )
}
function EmpresaFornecedor({ idEmpresa }: { idEmpresa: number }) {
  const { requisitar } = useAutenticacao()
  const [tab, setTab] = useState<Tab>("ASSOCIADOS")
  const [busca, setBusca] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)
  const [version, setVersion] = useState(0)
  const [dialog, setDialog] = useState<{ row: Row; editing: boolean } | null>(
    null,
  )
  const [cancel, setCancel] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)
  const delayed = useAtraso(busca)
  const url = listUrl(tab, delayed, status, page)
  const query = useCallback(
    (signal: AbortSignal) => list(requisitar, url, tab, signal),
    [requisitar, url, tab],
  )
  const { dados, erro, carregando } = useConsultaCliente(
    `${idEmpresa}:${url}:${version}`,
    query,
  )
  const state = stateOfPage(carregando, erro, dados?.count ?? 0)
  const reload = () => {
    setPage(1)
    setVersion((v) => v + 1)
  }
  const changeTab = (next: Tab) => {
    setTab(next)
    setPage(1)
    setDialog(null)
    setCancel(null)
  }
  async function reactivate(row: Row) {
    if (busy) return
    setBusy(true)
    try {
      await save(requisitar, row, { status: "ATIVO" }, true)
      toast.success("Associação reativada.")
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reativar.")
    } finally {
      setBusy(false)
    }
  }
  async function deactivate() {
    if (!cancel?.associacao || busy) return
    setBusy(true)
    try {
      await inactivate(requisitar, cancel.associacao.id)
      toast.success("Associação inativada. Histórico preservado.")
      setCancel(null)
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível inativar.")
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="Tipo de fornecedor">
        {(
          [
            ["ASSOCIADOS", "Globais associados"],
            ["ESPECIFICO", "Específicos da empresa"],
            ["GLOBAL_DISPONIVEL", "Globais disponíveis"],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={tab === value ? "default" : "outline"}
            aria-pressed={tab === value}
            onClick={() => changeTab(value)}
            disabled={busy}
          >
            {label}
          </Button>
        ))}
        <Button
          variant="ghost"
          render={<Link href="/cadastros/fornecedores" />}
        >
          Cadastro de fornecedores
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input
            className="pl-9"
            aria-label="Pesquisar fornecedores por nome ou CNPJ"
            placeholder="Buscar por razão social, fantasia ou CNPJ"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPage(1)
            }}
          />
        </div>
        {tab === "ASSOCIADOS" && (
          <NativeSelect
            aria-label="Situação da associação"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPage(1)
            }}
          >
            <NativeSelectOption value="">Todas as situações</NativeSelectOption>
            <NativeSelectOption value="ATIVO">Ativos</NativeSelectOption>
            <NativeSelectOption value="INATIVO">Inativos</NativeSelectOption>
          </NativeSelect>
        )}
      </div>
      {state === "loading" ? (
        <Skeleton
          role="status"
          aria-label="Carregando condições de fornecedores"
          className="h-72 w-full"
        />
      ) : state === "error" ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            <p>{erro}</p>
            <Button variant="outline" onClick={reload}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : state === "empty" ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Truck />
            </EmptyMedia>
            <EmptyTitle>Nenhum fornecedor encontrado</EmptyTitle>
            <EmptyDescription>
              {tab === "ASSOCIADOS"
                ? "Associe um fornecedor na aba Globais disponíveis ou revise os filtros."
                : "Não há fornecedores disponíveis para os filtros selecionados."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Origem / situação</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Entrega</TableHead>
                <TableHead>Observações comerciais</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados?.rows.map((row) => (
                <TableRow key={row.fornecedor.id}>
                  <TableCell>
                    <p className="font-medium">{row.fornecedor.razao_social}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.fornecedor.nome_fantasia}
                    </p>
                  </TableCell>
                  <TableCell>{formatarCnpj(row.fornecedor.cnpj)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {tab === "ESPECIFICO"
                        ? "Específico"
                        : tab === "GLOBAL_DISPONIVEL"
                          ? "Global disponível"
                          : "Global associado"}
                    </Badge>
                    {row.associacao && tab !== "ESPECIFICO" && (
                      <Badge
                        variant={
                          row.associacao.status === "ATIVO"
                            ? "default"
                            : "secondary"
                        }
                      >
                        {row.associacao.status === "ATIVO"
                          ? "Ativo"
                          : "Inativo"}
                      </Badge>
                    )}
                    {row.fornecedor.status === "INATIVO" && (
                      <Badge variant="destructive">
                        Fornecedor indisponível
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{days(row.associacao?.prazo_pagamento)}</TableCell>
                  <TableCell>{days(row.associacao?.prazo_entrega)}</TableCell>
                  <TableCell className="max-w-64 break-words whitespace-normal">
                    {row.associacao?.observacao || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {tab === "GLOBAL_DISPONIVEL" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => setDialog({ row, editing: false })}
                        >
                          <Link2 />
                          {row.associacao ? "Reativar" : "Associar"}
                        </Button>
                      )}
                      {tab === "ASSOCIADOS" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setDialog({ row, editing: true })}
                          >
                            <Pencil />
                            Condições
                          </Button>
                          {row.associacao?.status === "ATIVO" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => setCancel(row)}
                            >
                              Inativar
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={
                                busy || row.fornecedor.status !== "ATIVO"
                              }
                              onClick={() => void reactivate(row)}
                            >
                              Reativar
                            </Button>
                          )}
                        </>
                      )}
                      {tab === "ESPECIFICO" && (
                        <span className="text-xs text-muted-foreground">
                          Não exige associação
                        </span>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {dados?.count ?? 0} registros · Página {page} de{" "}
          {Math.max(1, dados?.totalPages ?? 0)}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={carregando || page === 1 || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={carregando || !dados || page >= dados.totalPages || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>
      {dialog && (
        <FormularioCondicoes
          key={`${idEmpresa}:${dialog.row.fornecedor.id}`}
          row={dialog.row}
          editing={dialog.editing}
          requisitar={requisitar}
          onClose={() => setDialog(null)}
          onSaved={reload}
        />
      )}
      <AlertDialog
        open={!!cancel}
        onOpenChange={(open) => {
          if (!open && !busy) setCancel(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar associação?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancel?.fornecedor.razao_social} ficará indisponível para novas
              compras desta empresa. Compras existentes e vínculos de outras
              empresas serão preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => void deactivate()}
            >
              {busy ? "Inativando…" : "Inativar associação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
function days(value: number | null | undefined) {
  return value === null || value === undefined
    ? "Não informado"
    : value === 0
      ? "Imediato"
      : `${value} dias`
}

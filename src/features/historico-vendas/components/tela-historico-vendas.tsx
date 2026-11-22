"use client"

import Link from "next/link"
import { Receipt, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { formatarDataHora, formatarMoeda } from "@/lib/formatacao"
import {
  filtrarVendas,
  opcoesStatus,
  rotuloStatus,
  variacaoStatus,
} from "../regras"
import type { FiltroStatus, VendaLista } from "../tipos"
import { DetalheVenda } from "./detalhe-venda"

const limitePorPagina = 10

export function TelaHistoricoVendas() {
  const {
    estado: estadoAutenticacao,
    empresas,
    empresa,
    selecionarEmpresa,
    requisitar,
  } = useAutenticacao()
  const [vendas, setVendas] = useState<VendaLista[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState("")
  const [busca, setBusca] = useState("")
  const [status, setStatus] = useState<FiltroStatus>("todos")
  const [pagina, setPagina] = useState(0)
  const [aberta, setAberta] = useState<VendaLista | null>(null)
  const versaoRequisicao = useRef(0)
  const empresaCarregada = useRef<number | null>(null)

  const recarregar = useCallback(async () => {
    if (!empresa) return
    const versaoAtual = ++versaoRequisicao.current
    setCarregando(true)
    try {
      const resposta = await requisitar("/api/vendas")
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      const corpo = (await resposta.json()) as { dados: VendaLista[] }
      if (versaoAtual !== versaoRequisicao.current) return
      setVendas(corpo.dados)
      setErro("")
    } catch (causa) {
      if (versaoAtual !== versaoRequisicao.current) return
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível carregar as vendas.",
      )
    } finally {
      if (versaoAtual === versaoRequisicao.current) setCarregando(false)
    }
  }, [empresa, requisitar])

  useEffect(() => {
    if (estadoAutenticacao !== "autenticado" || !empresa) return
    const idEmpresa = empresa.id
    void Promise.resolve().then(() => {
      // Trocou de empresa: descarta as vendas da anterior antes de carregar.
      if (empresaCarregada.current !== idEmpresa) {
        empresaCarregada.current = idEmpresa
        setVendas([])
        setErro("")
        setAberta(null)
        setPagina(0)
      }
      return recarregar()
    })
  }, [empresa, estadoAutenticacao, recarregar])

  const filtradas = useMemo(
    () => filtrarVendas(vendas, busca, status),
    [vendas, busca, status],
  )
  const totalPaginas = Math.max(
    1,
    Math.ceil(filtradas.length / limitePorPagina),
  )
  const paginaAtual = Math.min(pagina, totalPaginas - 1)
  const visiveis = filtradas.slice(
    paginaAtual * limitePorPagina,
    (paginaAtual + 1) * limitePorPagina,
  )

  const cabecalho = (
    <PageHeader
      titulo="Histórico de vendas"
      descricao="Vendas da empresa com itens, parcelas e mudanças de status."
      acoes={
        <Button variant="outline" render={<Link href="/vendas" />}>
          Ir para o PDV
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
          aria-label="Carregando vendas"
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
            Entre na sua conta para ver as vendas.{" "}
            <Link href="/login" className="underline">
              Ir para o login
            </Link>
          </AlertDescription>
        </Alert>
      </>
    )

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

  if (!empresa)
    return (
      <>
        {cabecalho}
        <Alert>
          <AlertDescription>
            Selecione uma empresa para ver as vendas.
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
                aria-label="Buscar vendas"
                className="pl-9"
                placeholder="Buscar por número, cliente, pedido ou produto..."
                value={busca}
                onChange={(evento) => {
                  setBusca(evento.target.value)
                  setPagina(0)
                }}
              />
            </div>
            <NativeSelect
              aria-label="Filtrar por status"
              value={status}
              onChange={(evento) => {
                setStatus(evento.target.value as FiltroStatus)
                setPagina(0)
              }}
            >
              <NativeSelectOption value="todos">
                Todos os status
              </NativeSelectOption>
              {opcoesStatus.map((opcao) => (
                <NativeSelectOption key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venda</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
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
                      Carregando vendas…
                    </TableCell>
                  </TableRow>
                ) : visiveis.length ? (
                  visiveis.map((venda) => (
                    <TableRow key={venda.id}>
                      <TableCell>
                        <p className="font-medium">{venda.numero}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatarDataHora(new Date(venda.data))}
                        </p>
                      </TableCell>
                      <TableCell>{venda.cliente ?? "—"}</TableCell>
                      <TableCell>{venda.pedido}</TableCell>
                      <TableCell>
                        <Badge variant={variacaoStatus(venda.status)}>
                          {rotuloStatus[venda.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatarMoeda(venda.total)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAberta(venda)}
                        >
                          Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-40">
                      <Empty>
                        <EmptyHeader>
                          <EmptyMedia variant="icon">
                            <Receipt />
                          </EmptyMedia>
                          <EmptyTitle>
                            {vendas.length
                              ? "Nenhuma venda encontrada"
                              : "Nenhuma venda registrada"}
                          </EmptyTitle>
                          <EmptyDescription>
                            {vendas.length
                              ? "Tente outra busca ou outro status."
                              : "As vendas aparecem aqui quando um pedido é fechado ou uma venda é feita no PDV."}
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
              {filtradas.length
                ? `${paginaAtual * limitePorPagina + 1}–${Math.min((paginaAtual + 1) * limitePorPagina, filtradas.length)} de ${filtradas.length} vendas`
                : "0 vendas"}
              {vendas.length >= 200 && " (mostrando as 200 mais recentes)"}
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

      {aberta && (
        <DetalheVenda
          key={aberta.id}
          venda={aberta}
          onClose={() => setAberta(null)}
        />
      )}
    </>
  )
}

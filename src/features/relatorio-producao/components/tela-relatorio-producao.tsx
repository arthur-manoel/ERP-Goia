"use client"

import { type FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CircleAlert, Factory, RefreshCw } from "lucide-react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { formatarQuantidade } from "@/lib/formatacao"
import type { ResultadoRelatorioProducao } from "../tipos"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function periodoInicial() {
  const hoje = new Date()
  return new Date(hoje.getFullYear(), hoje.getMonth(), 1)
    .toISOString()
    .slice(0, 10)
}

function hoje() {
  return new Date().toLocaleDateString("sv-SE")
}

function mensagemPadrao(response: Response) {
  return response
    .json()
    .then((body: { error?: string }) => body.error)
    .catch(() => undefined)
}

export function TelaRelatorioProducao() {
  const searchParams = useSearchParams()
  const { estado, empresa } = useAutenticacao()

  if (estado === "carregando")
    return (
      <div
        role="status"
        aria-label="Carregando relatório"
        className="space-y-4"
      >
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )

  if (estado === "anonimo")
    return (
      <Alert>
        <AlertDescription>
          Entre na sua conta para consultar o relatório de produção.{" "}
          <Link href="/login" className="underline">
            Ir para o login
          </Link>
        </AlertDescription>
      </Alert>
    )

  if (!empresa)
    return (
      <Alert>
        <AlertDescription>
          Selecione uma empresa ativa para consultar o relatório de produção.
        </AlertDescription>
      </Alert>
    )

  return (
    <ConteudoRelatorioProducao
      key={`${empresa.id}:${searchParams.toString()}`}
    />
  )
}

function ConteudoRelatorioProducao() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { requisitar } = useAutenticacao()
  const parametros = searchParams.toString()
  const inicial = searchParams.get("data_inicial") ?? periodoInicial()
  const final = searchParams.get("data_final") ?? hoje()
  const [dataInicial, setDataInicial] = useState(inicial)
  const [dataFinal, setDataFinal] = useState(final)
  const [resultado, setResultado] = useState<ResultadoRelatorioProducao | null>(
    null,
  )
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState("")
  const [erroPeriodo, setErroPeriodo] = useState("")

  async function carregar() {
    const consulta = new URLSearchParams(parametros)
    if (!consulta.has("data_inicial")) consulta.set("data_inicial", inicial)
    if (!consulta.has("data_final")) consulta.set("data_final", final)

    setCarregando(true)
    setErro("")
    try {
      const response = await requisitar(
        `/api/relatorios/producao?${consulta.toString()}`,
      )
      if (!response.ok) {
        const mensagem = await mensagemPadrao(response)
        throw new Error(mensagem ?? "Não foi possível carregar o relatório.")
      }
      setResultado((await response.json()) as ResultadoRelatorioProducao)
    } catch (error) {
      setResultado(null)
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o relatório.",
      )
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    let ativo = true
    const consulta = new URLSearchParams(parametros)
    if (!consulta.has("data_inicial")) consulta.set("data_inicial", inicial)
    if (!consulta.has("data_final")) consulta.set("data_final", final)

    void requisitar(`/api/relatorios/producao?${consulta.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const mensagem = await mensagemPadrao(response)
          throw new Error(mensagem ?? "Não foi possível carregar o relatório.")
        }
        return (await response.json()) as ResultadoRelatorioProducao
      })
      .then(
        (dados) => {
          if (!ativo) return
          setResultado(dados)
          setErro("")
        },
        (error: unknown) => {
          if (!ativo) return
          setResultado(null)
          setErro(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o relatório.",
          )
        },
      )
      .finally(() => {
        if (ativo) setCarregando(false)
      })

    return () => {
      ativo = false
    }
  }, [final, inicial, parametros, requisitar])

  function aplicarFiltros(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dataInicial || !dataFinal || dataInicial > dataFinal) {
      setErroPeriodo('A data "De" não pode ser posterior à data "Até".')
      return
    }
    const consulta = new URLSearchParams(searchParams)
    consulta.set("data_inicial", dataInicial)
    consulta.set("data_final", dataFinal)
    consulta.set("pagina", "1")
    router.replace(`${pathname}?${consulta.toString()}`)
  }

  function limparFiltros() {
    const consulta = new URLSearchParams()
    consulta.set("data_inicial", periodoInicial())
    consulta.set("data_final", hoje())
    router.replace(`${pathname}?${consulta.toString()}`)
  }

  function mudarPagina(pagina: number) {
    const consulta = new URLSearchParams(searchParams)
    consulta.set("data_inicial", inicial)
    consulta.set("data_final", final)
    consulta.set("pagina", String(pagina))
    router.push(`${pathname}?${consulta.toString()}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <CircleAlert aria-hidden />
        <AlertTitle>Escopo parcial com dados reais</AlertTitle>
        <AlertDescription>
          As quantidades abaixo são registradas no encerramento de OPs
          concluídas. Atualmente, o sistema preenche esse registro com a
          quantidade planejada, sem medição de produção por etapa.
        </AlertDescription>
      </Alert>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={aplicarFiltros}
        noValidate
      >
        <label className="grid gap-1 text-sm font-medium">
          De
          <Input
            type="date"
            value={dataInicial}
            onChange={(event) => setDataInicial(event.target.value)}
            aria-invalid={!!erroPeriodo}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          Até
          <Input
            type="date"
            value={dataFinal}
            onChange={(event) => setDataFinal(event.target.value)}
            aria-invalid={!!erroPeriodo}
          />
        </label>
        <Button type="submit" disabled={carregando}>
          Aplicar filtros
        </Button>
        <Button type="button" variant="outline" onClick={limparFiltros}>
          Limpar filtros
        </Button>
        {erroPeriodo && (
          <p className="w-full text-sm text-destructive">{erroPeriodo}</p>
        )}
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Produtos no período
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {carregando ? "—" : (resultado?.resumo.totalProdutos ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              OPs concluídas
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {carregando ? "—" : (resultado?.resumo.totalOrdensConcluidas ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prazo cumprido versus atrasado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">Indisponível</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Índice de perda
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">Indisponível</Badge>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Produção por etapa
            </CardTitle>
            <CardDescription>
              Indisponível: as etapas registram datas e situação, mas não uma
              quantidade produzida própria.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Limitações dos indicadores
            </CardTitle>
            <CardDescription>
              Não há perdas persistidas nem regra oficial para classificar
              cumprimento ou atraso de prazo.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {erro ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>Não foi possível carregar o relatório</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            {erro}
            <Button variant="outline" onClick={() => void carregar()}>
              <RefreshCw data-icon="inline-start" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : carregando ? (
        <div
          role="status"
          aria-label="Carregando relatório"
          className="space-y-4"
        >
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Quantidade registrada por produto</CardTitle>
            <CardDescription>
              Registros de itens de OPs concluídas entre as datas selecionadas.
              Quantidades de unidades diferentes não são somadas entre si.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">
                      Quantidade registrada
                    </TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">OPs concluídas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultado?.dados.length ? (
                    resultado.dados.map((linha) => (
                      <TableRow key={linha.produto.id}>
                        <TableCell className="font-mono text-xs">
                          {linha.produto.codigo}
                        </TableCell>
                        <TableCell className="font-medium">
                          {linha.produto.nome}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatarQuantidade(linha.quantidadeRegistrada)}
                        </TableCell>
                        <TableCell>{linha.produto.unidade}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {linha.ordensConcluidas}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="p-0">
                        <Empty className="py-12">
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <Factory />
                            </EmptyMedia>
                            <EmptyTitle>
                              Nenhuma OP concluída no período
                            </EmptyTitle>
                            <EmptyDescription>
                              Altere o período para consultar outros
                              encerramentos de produção.
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {resultado && resultado.paginacao.totalPaginas > 1 && (
              <Pagination className="mt-4">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      text="Anterior"
                      aria-disabled={resultado.paginacao.pagina <= 1}
                      onClick={(event) => {
                        event.preventDefault()
                        if (resultado.paginacao.pagina > 1)
                          mudarPagina(resultado.paginacao.pagina - 1)
                      }}
                    />
                  </PaginationItem>
                  <PaginationItem className="px-2 text-sm text-muted-foreground">
                    Página {resultado.paginacao.pagina} de{" "}
                    {resultado.paginacao.totalPaginas}
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      text="Próxima"
                      aria-disabled={
                        resultado.paginacao.pagina >=
                        resultado.paginacao.totalPaginas
                      }
                      onClick={(event) => {
                        event.preventDefault()
                        if (
                          resultado.paginacao.pagina <
                          resultado.paginacao.totalPaginas
                        )
                          mudarPagina(resultado.paginacao.pagina + 1)
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

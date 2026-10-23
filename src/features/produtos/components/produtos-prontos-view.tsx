"use client"

import Link from "next/link"
import { PackageOpen, Plus, Search } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import type { Produto, RespostaPaginada, TipoProduto } from "../tipos"
import { DialogoFluxoProduto } from "./dialogo-fluxo-produto"
import { FormularioProdutoPronto } from "./formulario-produto-pronto"
import { TabelaProdutosProntos } from "./tabela-produtos-prontos"

const limitePorPagina = 10
const limiteTipos = 100

export function ProdutosProntosView() {
  const {
    estado: estadoAutenticacao,
    empresa,
    empresas,
    selecionarEmpresa,
    requisitar,
  } = useAutenticacao()
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [tipos, setTipos] = useState<TipoProduto[]>([])
  const [busca, setBusca] = useState("")
  const [buscaAplicada, setBuscaAplicada] = useState("")
  const [status, setStatus] = useState("")
  const [pagina, setPagina] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [empresaCarregada, setEmpresaCarregada] = useState<number | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState("")
  const [erroTipos, setErroTipos] = useState("")
  const [carregandoTipos, setCarregandoTipos] = useState(false)
  const [empresaTiposCarregados, setEmpresaTiposCarregados] = useState<
    number | null
  >(null)
  const [dialogo, setDialogo] = useState<"novo" | Produto | null>(null)
  const [produtoDoFluxo, setProdutoDoFluxo] = useState<Produto | null>(null)
  const [produtoParaInativar, setProdutoParaInativar] =
    useState<Produto | null>(null)
  const [inativando, setInativando] = useState(false)
  const versaoRequisicao = useRef(0)
  const versaoTipos = useRef(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBuscaAplicada(busca.trim())
      setPagina(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [busca])

  const recarregar = useCallback(async () => {
    if (!empresa) return
    const versao = ++versaoRequisicao.current
    setCarregando(true)
    try {
      const parametros = new URLSearchParams({
        id_empresa: String(empresa.id),
        page: String(pagina),
        limit: String(limitePorPagina),
      })
      if (buscaAplicada) parametros.set("busca", buscaAplicada)
      if (status) parametros.set("status", status)

      const respostaProdutos = await requisitar(`/api/produtos?${parametros}`)
      if (!respostaProdutos.ok)
        throw new Error(await mensagemErro(respostaProdutos))
      const corpoProdutos = (await respostaProdutos.json()) as {
        data: RespostaPaginada<Produto>
      }

      if (versao !== versaoRequisicao.current) return
      setProdutos(corpoProdutos.data.rows)
      setEmpresaCarregada(empresa.id)
      setTotal(corpoProdutos.data.count)
      setTotalPaginas(Math.max(1, corpoProdutos.data.totalPages))
      setErro("")
      if (
        corpoProdutos.data.count > 0 &&
        pagina > corpoProdutos.data.totalPages
      ) {
        setPagina(Math.max(1, corpoProdutos.data.totalPages))
      }
    } catch (causa) {
      if (versao !== versaoRequisicao.current) return
      setProdutos([])
      setEmpresaCarregada(null)
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível carregar os produtos.",
      )
    } finally {
      if (versao === versaoRequisicao.current) setCarregando(false)
    }
  }, [buscaAplicada, empresa, pagina, requisitar, status])

  const recarregarTipos = useCallback(async () => {
    if (!empresa) return
    const versao = ++versaoTipos.current
    setCarregandoTipos(true)
    try {
      const todos: TipoProduto[] = []
      let paginaAtual = 1
      let totalPaginasDisponiveis = 1
      do {
        const resposta = await requisitar(
          `/api/tipos_produto?page=${paginaAtual}&limit=${limiteTipos}`,
        )
        if (!resposta.ok) throw new Error(await mensagemErro(resposta))
        const corpo = (await resposta.json()) as {
          data: RespostaPaginada<TipoProduto>
        }
        todos.push(...corpo.data.rows)
        totalPaginasDisponiveis = corpo.data.totalPages
        paginaAtual += 1
      } while (paginaAtual <= totalPaginasDisponiveis)
      if (versao !== versaoTipos.current) return
      setTipos(todos)
      setEmpresaTiposCarregados(empresa.id)
      setErroTipos("")
    } catch (causa) {
      if (versao !== versaoTipos.current) return
      setTipos([])
      setEmpresaTiposCarregados(null)
      setErroTipos(
        causa instanceof Error
          ? causa.message
          : "Não foi possível carregar os tipos de produto.",
      )
    } finally {
      if (versao === versaoTipos.current) setCarregandoTipos(false)
    }
  }, [empresa, requisitar])

  useEffect(() => {
    if (estadoAutenticacao !== "autenticado" || !empresa) return
    void Promise.resolve().then(recarregar)
    return () => {
      versaoRequisicao.current += 1
    }
  }, [empresa, estadoAutenticacao, recarregar])

  useEffect(() => {
    if (estadoAutenticacao !== "autenticado" || !empresa) return
    void Promise.resolve().then(recarregarTipos)
    return () => {
      versaoTipos.current += 1
    }
  }, [empresa, estadoAutenticacao, recarregarTipos])

  async function inativar() {
    if (!produtoParaInativar) return
    setInativando(true)
    try {
      const resposta = await requisitar(
        `/api/produtos/${produtoParaInativar.id}`,
        {
          method: "DELETE",
        },
      )
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success("Produto inativado.")
      setProdutoParaInativar(null)
      await recarregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error
          ? causa.message
          : "Não foi possível inativar o produto.",
      )
    } finally {
      setInativando(false)
    }
  }

  async function abrirEdicao(produto: Produto) {
    const versao = versaoRequisicao.current
    try {
      const resposta = await requisitar(`/api/produtos/${produto.id}`)
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      const corpo = (await resposta.json()) as { data: Produto }
      if (versao === versaoRequisicao.current) setDialogo(corpo.data)
    } catch (causa) {
      if (versao === versaoRequisicao.current) {
        toast.error(
          causa instanceof Error
            ? causa.message
            : "Não foi possível consultar o produto.",
        )
      }
    }
  }

  const cabecalho = (
    <PageHeader
      titulo="Produtos"
      descricao="Cadastre e consulte os produtos do catálogo da empresa."
      acoes={
        <Button
          onClick={() => setDialogo("novo")}
          disabled={
            !empresa ||
            empresaCarregada !== empresa.id ||
            empresaTiposCarregados !== empresa.id ||
            carregandoTipos ||
            Boolean(erroTipos) ||
            !tipos.some((tipo) => tipo.status === "ATIVO")
          }
        >
          <Plus className="size-4" /> Novo produto
        </Button>
      }
    />
  )

  if (estadoAutenticacao === "carregando")
    return (
      <main className="space-y-6 p-4 md:p-6">
        {cabecalho}
        <Skeleton className="h-80 w-full" aria-label="Carregando produtos" />
      </main>
    )
  if (estadoAutenticacao === "anonimo")
    return (
      <main className="space-y-6 p-4 md:p-6">
        {cabecalho}
        <Alert>
          <AlertDescription>
            Entre na sua conta para gerenciar produtos.{" "}
            <Link href="/login" className="underline">
              Ir para o login
            </Link>
          </AlertDescription>
        </Alert>
      </main>
    )
  if (!empresa)
    return (
      <main className="space-y-6 p-4 md:p-6">
        {cabecalho}
        <Alert>
          <AlertDescription>
            Selecione uma empresa para consultar os produtos.
          </AlertDescription>
        </Alert>
        <SearchSelect
          label="Empresa ativa"
          value=""
          onValueChange={(valor) => {
            setPagina(1)
            setDialogo(null)
            setProdutoDoFluxo(null)
            setProdutoParaInativar(null)
            selecionarEmpresa(Number(valor))
          }}
          options={empresas.map((item) => ({
            value: String(item.id),
            label: item.nome,
          }))}
        />
      </main>
    )

  return (
    <main className="space-y-6 p-4 md:p-6">
      {cabecalho}
      {empresas.length > 1 && (
        <SearchSelect
          label="Empresa ativa"
          value={String(empresa.id)}
          onValueChange={(valor) => {
            setPagina(1)
            setDialogo(null)
            setProdutoDoFluxo(null)
            setProdutoParaInativar(null)
            selecionarEmpresa(Number(valor))
          }}
          options={empresas.map((item) => ({
            value: String(item.id),
            label: item.nome,
          }))}
          className="w-full sm:w-80"
        />
      )}
      <section
        className="flex flex-wrap gap-3 rounded-xl border bg-card p-4"
        aria-label="Filtros de produtos"
      >
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar produto"
            className="pl-9"
            placeholder="Buscar por código ou nome"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Filtrar por status"
          value={status}
          onChange={(evento) => {
            setStatus(evento.target.value)
            setPagina(1)
          }}
        >
          <option value="">Todos os status</option>
          <option value="ATIVO">Ativos</option>
          <option value="INATIVO">Inativos</option>
        </select>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setBusca("")
            setBuscaAplicada("")
            setStatus("")
            setPagina(1)
          }}
        >
          Limpar filtros
        </Button>
      </section>
      {erro && (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar os produtos</AlertTitle>
          <AlertDescription>
            {erro}{" "}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void recarregar()}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {erroTipos && !erro && (
        <Alert>
          <AlertTitle>Tipos de produto indisponíveis</AlertTitle>
          <AlertDescription>
            A listagem de produtos continua disponível. Para cadastrar um
            produto, a API de tipos precisa funcionar: {erroTipos}{" "}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void recarregarTipos()}
            >
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {empresaTiposCarregados === empresa.id &&
        !carregandoTipos &&
        !erroTipos &&
        tipos.length === 0 &&
        !erro && (
          <Alert>
            <AlertTitle>Nenhum tipo de produto ativo</AlertTitle>
            <AlertDescription>
              Cadastre um tipo de produto antes de criar produtos.{" "}
              <Link href="/cadastros/tipos-produto" className="underline">
                Ir para tipos de produto
              </Link>
            </AlertDescription>
          </Alert>
        )}
      {carregando || (empresaCarregada !== empresa.id && !erro) ? (
        <Skeleton
          className="h-72 w-full"
          role="status"
          aria-label="Carregando produtos"
        />
      ) : !erro && produtos.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>Nenhum produto encontrado</EmptyTitle>
            <EmptyDescription>
              Ajuste os filtros ou cadastre um produto.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        !erro && (
          <>
            <TabelaProdutosProntos
              produtos={produtos}
              tipos={tipos}
              onEditar={(produto) => void abrirEdicao(produto)}
              onFluxo={setProdutoDoFluxo}
              onInativar={setProdutoParaInativar}
            />
            <nav
              className="flex items-center justify-between gap-3"
              aria-label="Paginação de produtos"
            >
              <p className="text-sm text-muted-foreground">
                {total} produto{total === 1 ? "" : "s"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagina <= 1}
                  onClick={() => setPagina((atual) => atual - 1)}
                >
                  Anterior
                </Button>
                <span className="text-sm tabular-nums">
                  Página {pagina} de {totalPaginas}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina((atual) => atual + 1)}
                >
                  Próxima
                </Button>
              </div>
            </nav>
          </>
        )
      )}
      {dialogo && empresaCarregada === empresa.id && (
        <FormularioProdutoPronto
          key={dialogo === "novo" ? "novo" : dialogo.id}
          produto={dialogo === "novo" ? null : dialogo}
          idEmpresa={empresa.id}
          tipos={
            dialogo === "novo" ||
            tipos.some((tipo) => tipo.id === dialogo.id_tipo_produto)
              ? tipos
              : [
                  ...tipos,
                  {
                    id: dialogo.id_tipo_produto,
                    nome: `Tipo #${dialogo.id_tipo_produto} (indisponível)`,
                    status: "INATIVO",
                  },
                ]
          }
          aoFechar={() => setDialogo(null)}
          aoSalvar={recarregar}
        />
      )}
      {produtoDoFluxo && empresaCarregada === empresa.id && (
        <DialogoFluxoProduto
          key={`${empresa.id}:${produtoDoFluxo.id}`}
          produto={produtoDoFluxo}
          aoFechar={() => setProdutoDoFluxo(null)}
        />
      )}
      <AlertDialog
        open={Boolean(produtoParaInativar) && empresaCarregada === empresa.id}
        onOpenChange={(aberto) =>
          !aberto && !inativando && setProdutoParaInativar(null)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar produto?</AlertDialogTitle>
            <AlertDialogDescription>
              O produto {produtoParaInativar?.nome} ficará inativo no catálogo.
              Esta ação não apaga o registro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={inativando}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={inativando}
              onClick={(evento) => {
                evento.preventDefault()
                void inativar()
              }}
            >
              Inativar produto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

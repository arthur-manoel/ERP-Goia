"use client"

import { useMemo, useRef, useState } from "react"
import { PackageOpen, Plus, Search } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import {
  calcularPrecoVenda,
  coresDisponiveis,
  opcoesCategoria,
  situacaoProduto,
  tamanhosDisponiveis,
  totalSaldo,
  type ProdutoPronto,
  type ProdutoProntoFormulario,
} from "../schemas"
import { FormularioProdutoPronto } from "./formulario-produto-pronto"
import { MatrizGradeSaldo } from "./matriz-grade-saldo"
import { TabelaProdutosProntos } from "./tabela-produtos-prontos"

const ITENS_POR_PAGINA = 10

const produtosIniciais: ProdutoPronto[] = [
  {
    id: "cam-001",
    sku: "CAM-001",
    nome: "Camiseta básica",
    categoria: "Camisetas",
    unidade: "pc",
    precoCusto: 32,
    margemLucro: 45,
    precoVenda: calcularPrecoVenda(32, 45),
    variacoes: [
      { corId: "azul", tamanhoId: "p", saldo: 12 },
      { corId: "azul", tamanhoId: "m", saldo: 8 },
      { corId: "preto", tamanhoId: "p", saldo: 3 },
      { corId: "preto", tamanhoId: "m", saldo: 0 },
    ],
  },
  {
    id: "cal-015",
    sku: "CAL-015",
    nome: "Calça social slim",
    categoria: "Calças",
    unidade: "pc",
    precoCusto: 78.5,
    margemLucro: 55,
    precoVenda: calcularPrecoVenda(78.5, 55),
    variacoes: [
      { corId: "preto", tamanhoId: "m", saldo: 6 },
      { corId: "preto", tamanhoId: "g", saldo: 7 },
      { corId: "azul", tamanhoId: "m", saldo: 5 },
      { corId: "azul", tamanhoId: "g", saldo: 4 },
    ],
  },
  {
    id: "uni-008",
    sku: "UNI-008",
    nome: "Polo uniforme Goia",
    categoria: "Uniformes",
    unidade: "pc",
    precoCusto: 42,
    margemLucro: 50,
    precoVenda: calcularPrecoVenda(42, 50),
    variacoes: [
      { corId: "branco", tamanhoId: "pp", saldo: 0 },
      { corId: "branco", tamanhoId: "p", saldo: 0 },
      { corId: "branco", tamanhoId: "m", saldo: 0 },
    ],
  },
]

const opcoesSituacao = [
  { value: "Disponível", label: "Disponível" },
  { value: "Estoque baixo", label: "Estoque baixo" },
  { value: "Sem estoque", label: "Sem estoque" },
]

function normalizar(valor: string) {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
}

function opcoesDaGrade(produto: ProdutoPronto) {
  const cores = produto.variacoes
    .map((variacao) =>
      coresDisponiveis.find((cor) => cor.id === variacao.corId),
    )
    .filter((cor): cor is (typeof coresDisponiveis)[number] => Boolean(cor))
  const tamanhos = produto.variacoes
    .map((variacao) =>
      tamanhosDisponiveis.find((tamanho) => tamanho.id === variacao.tamanhoId),
    )
    .filter((tamanho): tamanho is (typeof tamanhosDisponiveis)[number] =>
      Boolean(tamanho),
    )

  return {
    cores: [...new Map(cores.map((cor) => [cor.id, cor])).values()],
    tamanhos: [
      ...new Map(tamanhos.map((tamanho) => [tamanho.id, tamanho])).values(),
    ],
  }
}

export function ProdutosProntosView() {
  const referenciaNovoProduto = useRef<HTMLButtonElement>(null)
  const [produtos, setProdutos] = useState(produtosIniciais)
  const [busca, setBusca] = useState("")
  const [categoria, setCategoria] = useState("")
  const [situacao, setSituacao] = useState("")
  const [pagina, setPagina] = useState(1)
  const [ordemCrescente, setOrdemCrescente] = useState(true)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [formularioAberto, setFormularioAberto] = useState(false)
  const [produtoEmEdicao, setProdutoEmEdicao] = useState<
    ProdutoPronto | undefined
  >()
  const [produtoDaMatriz, setProdutoDaMatriz] = useState<
    ProdutoPronto | undefined
  >()
  const [produtoParaExcluir, setProdutoParaExcluir] = useState<
    ProdutoPronto | undefined
  >()

  const filtrados = useMemo(() => {
    const termo = normalizar(busca)

    return produtos
      .filter(
        (produto) =>
          !termo ||
          normalizar(`${produto.sku} ${produto.nome}`).includes(termo),
      )
      .filter((produto) => !categoria || produto.categoria === categoria)
      .filter((produto) => !situacao || situacaoProduto(produto) === situacao)
      .sort((primeiro, segundo) => {
        const comparacao = primeiro.sku.localeCompare(segundo.sku, "pt-BR", {
          numeric: true,
        })
        return ordemCrescente ? comparacao : -comparacao
      })
  }, [busca, categoria, ordemCrescente, produtos, situacao])

  const totalPaginas = Math.max(
    1,
    Math.ceil(filtrados.length / ITENS_POR_PAGINA),
  )
  const paginaAtual = Math.min(pagina, totalPaginas)
  const produtosDaPagina = filtrados.slice(
    (paginaAtual - 1) * ITENS_POR_PAGINA,
    paginaAtual * ITENS_POR_PAGINA,
  )

  function abrirNovoProduto() {
    setProdutoEmEdicao(undefined)
    setFormularioAberto(true)
  }

  function abrirEdicao(produto: ProdutoPronto) {
    setProdutoEmEdicao(produto)
    setFormularioAberto(true)
  }

  function fecharFormulario() {
    setFormularioAberto(false)
    setProdutoEmEdicao(undefined)
    window.setTimeout(() => referenciaNovoProduto.current?.focus(), 0)
  }

  function salvarProduto(dados: ProdutoProntoFormulario) {
    const produto: ProdutoPronto = {
      id: produtoEmEdicao?.id ?? crypto.randomUUID(),
      nome: dados.nome.trim(),
      sku: dados.sku.trim(),
      categoria: dados.categoria,
      unidade: dados.unidade,
      precoCusto: dados.precoCusto,
      margemLucro: dados.margemLucro,
      precoVenda: calcularPrecoVenda(dados.precoCusto, dados.margemLucro),
      variacoes: dados.grade,
    }

    setProdutos((atuais) =>
      produtoEmEdicao
        ? atuais.map((item) => (item.id === produto.id ? produto : item))
        : [produto, ...atuais],
    )
    toast.success(
      produtoEmEdicao ? "Produto atualizado." : "Produto cadastrado.",
    )
    fecharFormulario()
  }

  function excluirProduto() {
    if (!produtoParaExcluir) return

    setProdutos((atuais) =>
      atuais.filter((produto) => produto.id !== produtoParaExcluir.id),
    )
    toast.success("Produto excluído.")
    setProdutoParaExcluir(undefined)
  }

  async function tentarNovamente() {
    setCarregando(true)
    setErro(null)
    try {
      await Promise.resolve()
    } catch {
      setErro("Não foi possível carregar os produtos prontos.")
    } finally {
      setCarregando(false)
    }
  }

  function limparFiltros() {
    setBusca("")
    setCategoria("")
    setSituacao("")
    setPagina(1)
  }

  const gradeDoProdutoAberto = produtoDaMatriz
    ? opcoesDaGrade(produtoDaMatriz)
    : undefined

  return (
    <main className="space-y-6 p-4 md:p-6">
      <PageHeader
        titulo="Produtos Prontos"
        descricao="Gestão de produtos com grade de tamanho e cor e controle de saldo."
        acoes={
          <Button ref={referenciaNovoProduto} onClick={abrirNovoProduto}>
            <Plus className="size-4" /> Novo produto
          </Button>
        }
      />

      <section
        className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[minmax(0,1fr)_12rem_12rem_auto]"
        aria-label="Filtros de produtos prontos"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar produto"
            className="pl-9"
            placeholder="Buscar por código ou produto"
            value={busca}
            onChange={(evento) => {
              setBusca(evento.target.value)
              setPagina(1)
            }}
          />
        </div>
        <SearchSelect
          id="filtro-categoria-produto"
          options={opcoesCategoria}
          placeholder="Todas as categorias"
          value={categoria}
          onValueChange={(valor) => {
            setCategoria(valor)
            setPagina(1)
          }}
        />
        <SearchSelect
          id="filtro-situacao-produto"
          options={opcoesSituacao}
          placeholder="Todas as situações"
          value={situacao}
          onValueChange={(valor) => {
            setSituacao(valor)
            setPagina(1)
          }}
        />
        <Button type="button" variant="outline" onClick={limparFiltros}>
          Limpar filtros
        </Button>
      </section>

      {erro ? (
        <Alert variant="destructive">
          <AlertTitle>Não foi possível carregar os produtos</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{erro}</span>
            <Button size="sm" variant="outline" onClick={tentarNovamente}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      ) : carregando ? (
        <div
          className="space-y-3 rounded-xl border p-4"
          role="status"
          aria-label="Carregando produtos prontos"
        >
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtrados.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>Nenhum produto encontrado</EmptyTitle>
            <EmptyDescription>
              Ajuste os filtros ou cadastre um produto pronto com sua grade.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={abrirNovoProduto}>
            <Plus className="size-4" /> Novo produto
          </Button>
        </Empty>
      ) : (
        <>
          <TabelaProdutosProntos
            produtos={produtosDaPagina}
            crescente={ordemCrescente}
            onAlternarOrdem={() => setOrdemCrescente((atual) => !atual)}
            onEditar={abrirEdicao}
            onVisualizarGrade={setProdutoDaMatriz}
            onExcluir={setProdutoParaExcluir}
          />
          <nav
            className="flex flex-col items-center justify-between gap-3 sm:flex-row"
            aria-label="Paginação de produtos prontos"
          >
            <p className="text-sm text-muted-foreground">
              {filtrados.length} produto{filtrados.length === 1 ? "" : "s"}{" "}
              encontrado{filtrados.length === 1 ? "" : "s"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={paginaAtual <= 1}
                onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
              >
                Anterior
              </Button>
              <span className="text-sm tabular-nums" aria-current="page">
                Página {paginaAtual} de {totalPaginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={paginaAtual >= totalPaginas}
                onClick={() =>
                  setPagina((atual) => Math.min(totalPaginas, atual + 1))
                }
              >
                Próxima
              </Button>
            </div>
          </nav>
        </>
      )}

      <FormularioProdutoPronto
        produto={produtoEmEdicao}
        aberto={formularioAberto}
        aoFechar={fecharFormulario}
        aoSalvar={salvarProduto}
      />

      <Dialog
        open={Boolean(produtoDaMatriz)}
        onOpenChange={(aberto) => !aberto && setProdutoDaMatriz(undefined)}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Grade de saldo — {produtoDaMatriz?.nome}</DialogTitle>
            <DialogDescription>
              Saldo atual por cor e tamanho. Total:{" "}
              <span className="tabular-nums">
                {produtoDaMatriz ? totalSaldo(produtoDaMatriz) : 0}
              </span>{" "}
              peças.
            </DialogDescription>
          </DialogHeader>
          {produtoDaMatriz && gradeDoProdutoAberto && (
            <MatrizGradeSaldo
              cores={gradeDoProdutoAberto.cores}
              tamanhos={gradeDoProdutoAberto.tamanhos}
              variacoes={produtoDaMatriz.variacoes}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(produtoParaExcluir)}
        onOpenChange={(aberto) => !aberto && setProdutoParaExcluir(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto pronto?</AlertDialogTitle>
            <AlertDialogDescription>
              O produto {produtoParaExcluir?.nome} e toda a sua grade serão
              removidos desta listagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={excluirProduto}>
              Excluir produto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  )
}

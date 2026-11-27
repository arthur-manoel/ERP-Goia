"use client"
import { useRef, useState, type FormEvent } from "react"
import { PageHeader } from "@/components/layout/page-header"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatarDataHora, formatarQuantidade } from "@/lib/formatacao"
import { movimentacao_estoque_tipo } from "@/generated/prisma/enums"
import {
  mensagem,
  useConsultaEstoque,
  type Catalogo,
  type Kardex,
  type Movimentos,
} from "../movimentos-api"
import { RegistrarMovimento } from "./registrar-movimento"

const formatoDia = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
})
const diaMs = 86_400_000
function filtrosIniciais() {
  const fim = formatoDia.format(new Date())
  return {
    dataInicio: new Date(Date.parse(fim) - 29 * diaMs)
      .toISOString()
      .slice(0, 10),
    dataFim: fim,
    idProduto: "",
    idVariacao: "",
    idLocalEstoque: "",
    idSetor: "",
    direcao: "",
    tipo: "",
    origemTipo: "",
    origemId: "",
  }
}
type Filtros = ReturnType<typeof filtrosIniciais>
const rotulosTipos: Record<movimentacao_estoque_tipo, string> = {
  ENTRADA_NF: "Entrada de nota fiscal",
  SAIDA_VENDA: "Saída de venda",
  ENTRADA_PRODUCAO: "Entrada de produção",
  SAIDA_PRODUCAO: "Saída para produção",
  AJUSTE_ENTRADA: "Ajuste positivo",
  AJUSTE_SAIDA: "Ajuste negativo",
  TRANSFERENCIA_ENTRADA: "Entrada por transferência",
  TRANSFERENCIA_SAIDA: "Saída por transferência",
}
const numero = (s: string | null) => (s === null ? "—" : formatarQuantidade(s))

export function TelaMovimentacoes({
  modo = "movimentacoes",
}: {
  modo?: "movimentacoes" | "kardex"
}) {
  const { estado, empresa, usuario, chaveEmpresa } = useAutenticacao()
  const kardex = modo === "kardex"
  return (
    <>
      <PageHeader
        titulo={kardex ? "Kardex" : "Movimentações de estoque"}
        descricao={
          kardex
            ? "Histórico e saldos agregados por posição de estoque."
            : "Registro e consulta de entradas, saídas e ajustes de inventário."
        }
      />
      {estado === "autenticado" && empresa && usuario ? (
        <Consulta
          key={`${usuario.id}:${empresa.id}:${chaveEmpresa}`}
          modo={modo}
        />
      ) : (
        <p role="status">Selecione uma empresa para consultar o estoque.</p>
      )}
    </>
  )
}

function BuscaCatalogo({ buscar }: { buscar: (s: string) => void }) {
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Buscar nas opções de estoque
      </summary>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const params = new URLSearchParams()
          for (const [k, v] of new FormData(e.currentTarget)) {
            const texto = String(v).trim()
            if (texto) params.set(k, texto)
          }
          buscar(params.toString())
        }}
      >
        {[
          ["produto", "Produto ou código"],
          ["variacao", "Cor ou tamanho"],
          ["local", "Nome do local"],
          ["setor", "Nome do setor"],
        ].map(([nome, label]) => (
          <label className="grid gap-1 text-sm" key={nome}>
            {label}
            <Input name={nome} maxLength={100} />
          </label>
        ))}
        <Button type="submit" variant="outline">
          Buscar opções
        </Button>
      </form>
    </details>
  )
}

function Consulta({ modo }: { modo: "movimentacoes" | "kardex" }) {
  const { requisitar, chaveEmpresa, conferirEmpresa } = useAutenticacao()
  const [rascunho, setRascunho] = useState(filtrosIniciais)
  const [filtros, setFiltros] = useState(filtrosIniciais)
  const [pagina, setPagina] = useState(1)
  const [revisao, setRevisao] = useState(0)
  const [erroFiltro, setErroFiltro] = useState("")
  const [erroExportar, setErroExportar] = useState("")
  const [exportando, setExportando] = useState<"csv" | "pdf" | null>(null)
  const travaExportacao = useRef(false)
  const base = `/api/estoque/${modo}`
  const query = new URLSearchParams(
    Object.entries(filtros).filter(([, v]) => v),
  )
  const params = new URLSearchParams(query)
  params.set("pagina", String(pagina))
  const [catalogoRevisao, setCatalogoRevisao] = useState(0)
  const [buscaCatalogo, setBuscaCatalogo] = useState("")
  const catalogoConsulta = useConsultaEstoque<Catalogo>(
    `/api/estoque/movimentacoes/catalogo?escopo=${modo}${buscaCatalogo ? "&" + buscaCatalogo : ""}`,
    catalogoRevisao,
  )
  const consulta = useConsultaEstoque<Kardex | Movimentos>(
    `${base}?${params}`,
    revisao,
  )
  const catalogo = catalogoConsulta?.dados
  const dados = consulta?.dados
  const atualizar = () => {
    setPagina(1)
    setRevisao((v) => v + 1)
  }
  const alterar = (nome: keyof Filtros, valor: string) =>
    setRascunho((v) => ({
      ...v,
      [nome]: valor,
      ...(nome === "idProduto" ? { idVariacao: "" } : {}),
      ...(nome === "origemTipo" && !valor ? { origemId: "" } : {}),
    }))
  function aplicar(e: FormEvent) {
    e.preventDefault()
    if (
      !rascunho.dataInicio ||
      !rascunho.dataFim ||
      rascunho.dataFim < rascunho.dataInicio ||
      Date.parse(rascunho.dataFim) - Date.parse(rascunho.dataInicio) >=
        366 * diaMs
    ) {
      setErroFiltro("Informe um período válido de até 366 dias.")
      return
    }
    setErroFiltro("")
    setErroExportar("")
    setFiltros({
      ...rascunho,
      origemTipo: rascunho.origemTipo.trim().toUpperCase(),
    })
    setPagina(1)
  }

  async function exportar(formato: "csv" | "pdf") {
    if (!dados || travaExportacao.current) return
    travaExportacao.current = true
    setExportando(formato)
    setErroExportar("")
    try {
      const p = new URLSearchParams(query)
      p.set("formato", formato)
      const r = await requisitar(`${base}/exportar?${p}`)
      if (!r.ok) throw new Error(await mensagem(r))
      const blob = await r.blob()
      conferirEmpresa(chaveEmpresa)
      if (
        formato === "csv"
          ? !blob.type.startsWith("text/csv")
          : blob.type !== "application/pdf"
      )
        throw new Error("O servidor não retornou o arquivo esperado.")
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${modo}.${formato}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1_000)
    } catch (e) {
      try {
        conferirEmpresa(chaveEmpresa)
        setErroExportar(e instanceof Error ? e.message : "Falha ao exportar.")
      } catch {
        /* A consulta pertence à empresa anterior. */
      }
    } finally {
      travaExportacao.current = false
      setExportando(null)
    }
  }

  const resumo = dados && "resumo" in dados ? dados.resumo : null
  const paginacao = dados?.paginacao
  const posicoes = [
    [
      "idProduto",
      "Produto",
      catalogo?.produtos.map((p) => ({
        ...p,
        nome: `${p.nome} · ${p.codigo ?? "#" + p.id}`,
      })),
    ],
    [
      "idVariacao",
      "Variação",
      catalogo?.variacoes.filter(
        (v) =>
          !rascunho.idProduto || v.idProduto === Number(rascunho.idProduto),
      ),
    ],
    ["idLocalEstoque", "Local", catalogo?.locais],
    ["idSetor", "Setor", catalogo?.setores],
  ] as const

  return (
    <div className="space-y-5">
      <BuscaCatalogo buscar={setBuscaCatalogo} />
      {Object.values(catalogo?.excedeu ?? {}).some(Boolean) && (
        <p className="text-sm text-muted-foreground">
          Há mais de 500 opções em um dos cadastros. Refine a busca para
          localizar as demais.
        </p>
      )}
      {modo === "movimentacoes" && catalogo && (
        <RegistrarMovimento catalogo={catalogo} atualizar={atualizar} />
      )}
      {catalogoConsulta?.erro && (
        <Alert variant="destructive">
          <AlertDescription>
            {catalogoConsulta.erro}{" "}
            <Button
              variant="outline"
              onClick={() => setCatalogoRevisao((v) => v + 1)}
            >
              Recarregar catálogo
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <form onSubmit={aplicar} className="space-y-3 rounded-md border p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm">
            Data inicial
            <Input
              type="date"
              value={rascunho.dataInicio}
              onChange={(e) => alterar("dataInicio", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Data final
            <Input
              type="date"
              value={rascunho.dataFim}
              onChange={(e) => alterar("dataFim", e.target.value)}
            />
          </label>
          {posicoes.map(([campo, label, opcoes]) => (
            <label key={campo} className="grid gap-1 text-sm">
              {label}
              <NativeSelect
                className="w-full"
                aria-label={label}
                value={rascunho[campo]}
                disabled={!catalogo}
                onChange={(e) => alterar(campo, e.target.value)}
              >
                <option value="">Todos</option>
                {rascunho[campo] &&
                  !opcoes?.some((o) => String(o.id) === rascunho[campo]) && (
                    <option value={rascunho[campo]}>
                      Seleção #{rascunho[campo]}
                    </option>
                  )}
                {opcoes?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                    {!o.ativo ? " (histórico)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ))}
          <label className="grid gap-1 text-sm">
            Direção
            <NativeSelect
              className="w-full"
              value={rascunho.direcao}
              onChange={(e) => alterar("direcao", e.target.value)}
            >
              <option value="">Todas</option>
              <option value="ENTRADA">Entrada</option>
              <option value="SAIDA">Saída</option>
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            Tipo de movimento
            <NativeSelect
              className="w-full"
              value={rascunho.tipo}
              onChange={(e) => alterar("tipo", e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(rotulosTipos).map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            Tipo de origem
            <Input
              maxLength={50}
              value={rascunho.origemTipo}
              onChange={(e) => alterar("origemTipo", e.target.value)}
              placeholder="Ex. API_ENTRADA"
            />
          </label>
          <label className="grid gap-1 text-sm">
            ID da origem
            <Input
              disabled={!rascunho.origemTipo}
              inputMode="numeric"
              value={rascunho.origemId}
              onChange={(e) => alterar("origemId", e.target.value)}
            />
          </label>
        </div>
        {erroFiltro && (
          <p className="text-destructive" role="alert">
            {erroFiltro}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Aplicar filtros</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const inicial = filtrosIniciais()
              setRascunho(inicial)
              setFiltros(inicial)
              setPagina(1)
              setErroFiltro("")
              setErroExportar("")
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={!dados || !!exportando || !catalogo?.permissoes.exportar}
          onClick={() => void exportar("csv")}
        >
          Exportar CSV
        </Button>
        <Button
          variant="outline"
          disabled={!dados || !!exportando || !catalogo?.permissoes.exportar}
          onClick={() => void exportar("pdf")}
        >
          Exportar PDF
        </Button>
        <p className="text-sm text-muted-foreground">
          {exportando
            ? `Gerando ${exportando.toUpperCase()}…`
            : catalogo?.permissoes.exportar === false
              ? "Exportação requer permissão de leitura de relatórios."
              : "Conjunto filtrado completo · CSV até 5.000 · PDF até 500"}
        </p>
      </div>
      {erroExportar && (
        <Alert variant="destructive">
          <AlertDescription>{erroExportar}</AlertDescription>
        </Alert>
      )}
      {resumo?.saldos && (
        <div className="space-y-1 rounded-md border p-4 text-sm">
          <p className="font-medium">Saldo comprovado da posição agregada</p>
          <p>
            Abertura {numero(resumo.saldos.abertura)} · Entradas{" "}
            {numero(resumo.saldos.entradas)} · Saídas{" "}
            {numero(resumo.saldos.saidas)} · Fechamento{" "}
            {numero(resumo.saldos.fechamento)} {resumo.unidade}
          </p>
          <p className="text-muted-foreground">
            O resumo inclui todos os movimentos da posição no período,
            independentemente dos filtros da lista.
          </p>
        </div>
      )}
      {resumo?.situacao === "SEM_ESCOPO" && (
        <p className="text-sm">
          Selecione produto e local para consultar o resumo da posição.
        </p>
      )}
      {resumo?.situacao === "INDISPONIVEL" && (
        <p className="text-sm">
          Saldo do período indisponível para esta posição. Motivo:{" "}
          {resumo.motivo?.replaceAll("_", " ").toLowerCase()}.
        </p>
      )}
      {!consulta && (
        <Skeleton
          role="status"
          aria-label="Consultando lançamentos"
          className="h-40 w-full"
        />
      )}
      {consulta?.erro && (
        <Alert variant="destructive">
          <AlertTitle>
            {consulta.status === 403
              ? "Acesso negado"
              : "Consulta indisponível"}
          </AlertTitle>
          <AlertDescription>
            {consulta.erro}{" "}
            <Button variant="outline" onClick={() => setRevisao((v) => v + 1)}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {dados && !dados.dados.length && (
        <p role="status">
          Nenhum lançamento nesta página para os filtros aplicados.
        </p>
      )}
      {dados && !!dados.dados.length && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {[
                  "Data e registro",
                  "Produto e variação",
                  "Local e setor",
                  "Direção e tipo",
                  "Quantidade",
                  ...(modo === "kardex"
                    ? ["Saldo agregado anterior", "Saldo agregado posterior"]
                    : []),
                  "Origem e observação",
                ].map((h) => (
                  <TableHead key={h}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.dados.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {r.dataMovimentacao
                      ? formatarDataHora(new Date(r.dataMovimentacao))
                      : "Data indisponível"}
                    <div className="text-muted-foreground">#{r.id}</div>
                  </TableCell>
                  <TableCell>
                    {r.produto?.nome ?? "Produto indisponível"}
                    {r.variacao && (
                      <div>
                        {[r.variacao.cor, r.variacao.tamanho]
                          .filter(Boolean)
                          .join(" / ") || `Variação #${r.variacao.id}`}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.localEstoque?.nome ?? "—"}
                    <div>{r.setor?.nome}</div>
                  </TableCell>
                  <TableCell>
                    {r.direcao === "ENTRADA" ? "Entrada" : "Saída"}
                    <div>
                      {r.tipo ? rotulosTipos[r.tipo] : "Tipo indisponível"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {numero(r.quantidade)} {r.produto?.unidade}
                  </TableCell>
                  {"saldo" in r && (
                    <>
                      <TableCell>{numero(r.saldo.anterior)}</TableCell>
                      <TableCell>
                        {r.saldo.situacao === "DIVERGENTE"
                          ? "Divergente"
                          : numero(r.saldo.posterior)}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="max-w-xs wrap-anywhere whitespace-normal">
                    {r.origem
                      ? `${r.origem.tipo}${r.origem.id === null ? "" : ` #${r.origem.id}`}`
                      : "—"}
                    {r.observacao && (
                      <div className="whitespace-pre-wrap">{r.observacao}</div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {paginacao && (
        <nav
          aria-label="Paginação"
          className="flex flex-wrap items-center gap-2"
        >
          <Button
            variant="outline"
            disabled={pagina <= 1}
            onClick={() => setPagina(1)}
          >
            Primeira
          </Button>
          <Button
            variant="outline"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm">
            {paginacao.totalRegistros} registros · Página {pagina} de{" "}
            {Math.max(paginacao.totalPaginas, 1)}
          </span>
          <Button
            variant="outline"
            disabled={pagina >= paginacao.totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </Button>
          <Button
            variant="outline"
            disabled={pagina >= paginacao.totalPaginas}
            onClick={() => setPagina(paginacao.totalPaginas)}
          >
            Última
          </Button>
          {paginacao.totalPaginas < paginacao.totalPaginasReais && (
            <p className="text-sm">
              Refine os filtros para consultar registros além das páginas
              acessíveis.
            </p>
          )}
        </nav>
      )}
    </div>
  )
}

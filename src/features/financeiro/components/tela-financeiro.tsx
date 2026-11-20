"use client"
import Link from "next/link"
import { useState, type FormEvent } from "react"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import {
  dataCivil,
  consultaSchema,
} from "@/modules/lancamentos-financeiros/schema"
import {
  diaExibido,
  moedaLivro,
  nomesOrigem,
  rotaLancamentos,
  useConsultaFinanceira,
  type Livro,
  type Lancamento,
  type Opcoes,
} from "../lancamentos-api"
import {
  BuscaOpcoesFinanceiras,
  FormularioLancamento,
} from "./formulario-lancamento"

function filtrosPadrao() {
  const hoje = dataCivil(new Date())
  return {
    de: hoje.slice(0, 8) + "01",
    ate: hoje,
    busca: "",
    idConta: "",
    idCategoria: "",
    origem: "",
    tipo: "",
  }
}

export function TelaFinanceiro() {
  const { estado, usuario, empresa, chaveEmpresa } = useAutenticacao()
  return (
    <>
      <PageHeader
        titulo="Lançamentos financeiros"
        descricao="Entradas, saídas e saldo das contas da empresa."
        acoes={
          <Button
            variant="outline"
            render={<Link href="/financeiro/contas-receber" />}
          >
            Contas a receber
          </Button>
        }
      />
      {estado === "autenticado" && usuario && empresa ? (
        <LivroFinanceiro key={`${usuario.id}:${empresa.id}:${chaveEmpresa}`} />
      ) : (
        <p role="status">Selecione uma empresa para consultar o financeiro.</p>
      )}
    </>
  )
}

function LivroFinanceiro() {
  const [rascunho, setRascunho] = useState(filtrosPadrao)
  const [filtros, setFiltros] = useState(filtrosPadrao)
  const [pagina, setPagina] = useState(1)
  const [revisao, setRevisao] = useState(0)
  const [erroFiltro, setErroFiltro] = useState("")
  const [idDetalhe, setIdDetalhe] = useState<number | null>(null)
  const [buscaOpcoes, setBuscaOpcoes] = useState("")
  const [revOpcoes, setRevOpcoes] = useState(0)
  const parametros = new URLSearchParams(
    Object.entries(filtros).filter(([, v]) => v),
  )
  parametros.set("pagina", String(pagina))
  const resposta = useConsultaFinanceira<Livro>(
    `${rotaLancamentos}?${parametros}`,
    revisao,
  )
  const opcoesConsulta = useConsultaFinanceira<Opcoes>(
    `${rotaLancamentos}/opcoes?${buscaOpcoes}`,
    revOpcoes,
  )
  const opcoes = opcoesConsulta?.dados
  const dados = resposta?.dados
  const pag = dados?.paginacao
  const conta = dados?.conta

  function aplicar(e: FormEvent) {
    e.preventDefault()
    const validacao = consultaSchema.safeParse(
      Object.fromEntries(Object.entries(rascunho).filter(([, v]) => v.trim())),
    )
    if (!validacao.success) {
      setErroFiltro(
        validacao.error.issues[0]?.message ?? "Confira o período e os filtros.",
      )
      return
    }
    setErroFiltro("")
    setFiltros({ ...rascunho, busca: rascunho.busca.trim() })
    setPagina(1)
  }
  const alterar = (campo: keyof typeof rascunho, valor: string) =>
    setRascunho((f) => ({ ...f, [campo]: valor }))

  return (
    <div className="space-y-5">
      <FormularioLancamento
        opcoes={opcoes}
        buscarOpcoes={setBuscaOpcoes}
        filtrosOpcoes={buscaOpcoes}
        erroOpcoes={opcoesConsulta?.erro}
        recarregarOpcoes={() => setRevOpcoes((v) => v + 1)}
        atualizar={() => {
          setPagina(1)
          setRevisao((v) => v + 1)
        }}
      />
      <BuscaOpcoesFinanceiras
        buscar={setBuscaOpcoes}
        filtros={buscaOpcoes}
        excedeu={opcoes?.maisContas || opcoes?.maisCategorias}
      />
      {opcoesConsulta?.erro && (
        <Alert variant="destructive">
          <AlertDescription>
            {opcoesConsulta.erro}{" "}
            <Button
              variant="outline"
              onClick={() => setRevOpcoes((v) => v + 1)}
            >
              Recarregar opções
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
              value={rascunho.de}
              onChange={(e) => alterar("de", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Data final
            <Input
              type="date"
              value={rascunho.ate}
              onChange={(e) => alterar("ate", e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Conta
            <NativeSelect
              aria-label="Filtrar conta"
              value={rascunho.idConta}
              disabled={!opcoes}
              onChange={(e) => alterar("idConta", e.target.value)}
            >
              <option value="">Todas</option>
              {rascunho.idConta &&
                !opcoes?.contas.some(
                  (c) => String(c.id) === rascunho.idConta,
                ) && (
                  <option value={rascunho.idConta}>
                    Conta #{rascunho.idConta}
                  </option>
                )}
              {opcoes?.contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.status !== "ATIVA" ? " (inativa)" : ""}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            Categoria
            <NativeSelect
              aria-label="Filtrar categoria"
              value={rascunho.idCategoria}
              disabled={!opcoes}
              onChange={(e) => alterar("idCategoria", e.target.value)}
            >
              <option value="">Todas</option>
              {rascunho.idCategoria &&
                !opcoes?.categorias.some(
                  (c) => String(c.id) === rascunho.idCategoria,
                ) && (
                  <option value={rascunho.idCategoria}>
                    Categoria #{rascunho.idCategoria}
                  </option>
                )}
              {opcoes?.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.status !== "ATIVA" ? " (inativa)" : ""}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            Tipo
            <NativeSelect
              value={rascunho.tipo}
              onChange={(e) => alterar("tipo", e.target.value)}
            >
              <option value="">Todos</option>
              <option value="ENTRADA">Entrada</option>
              <option value="SAIDA">Saída</option>
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            Origem
            <NativeSelect
              value={rascunho.origem}
              onChange={(e) => alterar("origem", e.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(nomesOrigem).map(([o, n]) => (
                <option key={o} value={o}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm lg:col-span-2">
            Busca por descrição ou observação
            <Input
              value={rascunho.busca}
              maxLength={100}
              onChange={(e) => alterar("busca", e.target.value)}
            />
          </label>
        </div>
        {erroFiltro && (
          <p role="alert" className="text-destructive">
            {erroFiltro}
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit">Aplicar filtros</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const base = filtrosPadrao()
              setRascunho(base)
              setFiltros(base)
              setPagina(1)
              setErroFiltro("")
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </form>
      {!resposta && (
        <Skeleton
          role="status"
          aria-label="Carregando lançamentos financeiros"
          className="h-44 w-full"
        />
      )}
      {resposta?.erro && (
        <Alert variant="destructive">
          <AlertTitle>
            {resposta.status === 403
              ? "Acesso negado"
              : "Consulta indisponível"}
          </AlertTitle>
          <AlertDescription>
            {resposta.erro}{" "}
            <Button variant="outline" onClick={() => setRevisao((v) => v + 1)}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {dados && (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              ["Entradas filtradas", dados.resumo.entradas],
              ["Saídas filtradas", dados.resumo.saidas],
              ["Líquido filtrado", dados.resumo.liquido],
            ].map(([titulo, valor]) => (
              <div key={titulo} className="rounded-md border p-4">
                <dt className="text-sm text-muted-foreground">{titulo}</dt>
                <dd className="font-semibold tabular-nums">
                  {moedaLivro(valor)}
                </dd>
              </div>
            ))}
          </dl>
          {conta && (
            <div className="rounded-md border p-4">
              <p className="font-medium">
                Saldo atual de {conta.nome}{" "}
                <span className="tabular-nums">
                  {moedaLivro(conta.saldoAtual)}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Saldo inicial {moedaLivro(conta.saldoInicial)} mais entradas
                menos saídas da conta até {diaExibido(conta.dataReferencia)}. O
                saldo atual inclui o livro inteiro da conta.
              </p>
            </div>
          )}
          {!dados.dados.length && (
            <p role="status">Nenhum lançamento para os filtros aplicados.</p>
          )}
          {!!dados.dados.length && (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {[
                      "Data",
                      "Descrição",
                      "Conta",
                      "Categoria",
                      "Tipo e origem",
                      "Valor",
                      "Ações",
                    ].map((h) => (
                      <TableHead key={h}>{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.dados.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{diaExibido(m.data)}</TableCell>
                      <TableCell className="max-w-sm wrap-anywhere whitespace-normal">
                        {m.descricao}
                      </TableCell>
                      <TableCell>
                        {m.conta.nome}
                        {m.conta.status !== "ATIVA" ? " (inativa)" : ""}
                      </TableCell>
                      <TableCell>
                        {m.categoria?.nome ?? "—"}
                        {m.categoria && m.categoria.status !== "ATIVA"
                          ? " (inativa)"
                          : ""}
                      </TableCell>
                      <TableCell>
                        {m.tipo === "ENTRADA" ? "Entrada" : "Saída"}
                        <div className="text-muted-foreground">
                          {nomesOrigem[m.origem]}
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {moedaLivro(m.valor)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Ver lançamento ${m.id}`}
                          onClick={() => setIdDetalhe(m.id)}
                        >
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {pag && (
            <nav
              aria-label="Paginação"
              className="flex flex-wrap items-center gap-2"
            >
              <Button
                variant="outline"
                disabled={pag.pagina <= 1}
                onClick={() => setPagina(1)}
              >
                Primeira
              </Button>
              <Button
                variant="outline"
                disabled={pag.pagina <= 1}
                onClick={() => setPagina(pag.pagina - 1)}
              >
                Anterior
              </Button>
              <p className="text-sm">
                {pag.total} registros · Página {pag.pagina} de{" "}
                {Math.max(1, pag.totalPaginas)}
              </p>
              <Button
                variant="outline"
                disabled={pag.pagina >= pag.totalPaginas}
                onClick={() => setPagina(pag.pagina + 1)}
              >
                Próxima
              </Button>
              <Button
                variant="outline"
                disabled={pag.pagina >= pag.totalPaginas}
                onClick={() => setPagina(pag.totalPaginas)}
              >
                Última
              </Button>
              {pag.totalPaginas < pag.totalPaginasReais && (
                <p className="text-sm">
                  Refine os filtros para acessar o restante do histórico.
                </p>
              )}
            </nav>
          )}
        </>
      )}
      {idDetalhe !== null && (
        <Detalhe id={idDetalhe} fechar={() => setIdDetalhe(null)} />
      )}
    </div>
  )
}

function Detalhe({ id, fechar }: { id: number; fechar: () => void }) {
  const consulta = useConsultaFinanceira<Lancamento>(`${rotaLancamentos}/${id}`)
  const m = consulta?.dados
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) fechar()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lançamento #{id}</DialogTitle>
          <DialogDescription>Registro do livro de caixa.</DialogDescription>
        </DialogHeader>
        {!consulta && <Skeleton className="h-24" />}
        {consulta?.erro && (
          <p role="alert" className="text-destructive">
            {consulta.erro}
          </p>
        )}
        {m && (
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["Descrição", m.descricao],
              ["Observação", m.observacao ?? "—"],
              ["Conta", m.conta.nome],
              ["Categoria", m.categoria?.nome ?? "—"],
              ["Valor", moedaLivro(m.valor)],
              ["Data", diaExibido(m.data)],
              ["Tipo", m.tipo === "ENTRADA" ? "Entrada" : "Saída"],
              ["Origem", nomesOrigem[m.origem]],
              ...(m.referencia
                ? [
                    ["Registro de origem", `#${m.referencia.id}`],
                    [
                      "Título",
                      m.referencia.titulo ? `#${m.referencia.titulo}` : "—",
                    ],
                    ["Situação da origem", m.referencia.status ?? "—"],
                  ]
                : []),
            ].map(([chave, valor]) => (
              <div key={chave}>
                <dt className="text-muted-foreground">{chave}</dt>
                <dd className="wrap-anywhere whitespace-pre-wrap">{valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  )
}

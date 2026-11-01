"use client"

import Link from "next/link"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { formatarData, formatarMoeda } from "@/lib/formatacao"
import {
  formasRecebimento,
  recebimentoSchema,
  type RecebimentoInput,
} from "@/modules/recebimentos/recebimentos.schema"

type Titulo = {
  id: number
  descricao: string | null
  id_venda: number
  valor_original: string
  valor_final: string
  saldo: string | null
  situacao: string
  data_vencimento: string
  numero_parcela: number
  total_parcelas: number
}
type Detalhe = {
  id: number
  idPedido: number | null
  idVenda: number
  parcela: number
  totalParcelas: number
  valorOriginal: string
  valorDevido: string
  valorRecebido: string
  saldo: string
  vencimento: string
  situacao: string
  vencido: boolean
  pagamentos: {
    id: number
    valor: string
    data: string
    formaPagamento: string
    situacao: string
    responsavel: string | null
    conta: string | null
    referencia: string | null
    observacao: string | null
  }[]
  paginacao: { pagina: number; totalPaginas: number }
}
type Opcoes = {
  contas: { id: number; nome: string; tipo: string }[]
  formasPagamento: string[]
}
type Tentativa = { chave: string; dados: RecebimentoInput }
function assinarRascunho(notificar: () => void) {
  window.addEventListener("storage", notificar)
  return () => window.removeEventListener("storage", notificar)
}
const dataCivil = (value: string) =>
  formatarData(new Date(`${value.slice(0, 10)}T12:00:00.000Z`))
const hoje = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
async function obter<T>(resposta: Response): Promise<T> {
  const json = await resposta.json()
  if (!resposta.ok)
    throw new Error(json.error ?? "Não foi possível consultar os dados.")
  return json.data
}

export function TelaRecebimentos() {
  const { estado, usuario, empresa, empresas, selecionarEmpresa } =
    useAutenticacao()
  return (
    <>
      <PageHeader
        titulo="Contas a receber"
        descricao="Parcelas, histórico e recebimentos da empresa ativa."
      />
      {empresas.length > 1 && (
        <SearchSelect
          value={empresa ? String(empresa.id) : ""}
          onValueChange={(v) => selecionarEmpresa(Number(v))}
          label="Empresa ativa"
          placeholder="Selecione uma empresa"
          options={empresas.map((e) => ({
            value: String(e.id),
            label: e.nome,
          }))}
        />
      )}
      {estado === "carregando" ? (
        <Skeleton className="h-64 w-full" />
      ) : estado === "autenticado" && empresa ? (
        <RecebimentosEmpresa
          key={`${usuario?.email}:${empresa.id}`}
          identidade={`${usuario?.email}:${empresa.id}`}
        />
      ) : (
        <Alert>
          <AlertDescription>
            Entre na sua conta e selecione uma empresa para consultar os
            recebíveis.
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

function RecebimentosEmpresa({ identidade }: { identidade: string }) {
  const { requisitar } = useAutenticacao()
  const [pagina, setPagina] = useState(1)
  const [busca, setBusca] = useState("")
  const [filtro, setFiltro] = useState("")
  const [lista, setLista] = useState<{
    rows: Titulo[]
    totalPages: number
  } | null>(null)
  const [erro, setErro] = useState("")
  const [selecionado, setSelecionado] = useState<number | null>(null)
  const [revisao, setRevisao] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({
      page: String(pagina),
      limit: "25",
      busca: filtro,
    })
    requisitar(`/api/contas_receber?${query}`, { signal: controller.signal })
      .then(obter<{ rows: Titulo[]; totalPages: number }>)
      .then((dados) => {
        if (!controller.signal.aborted) {
          setLista(dados)
          setErro("")
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setErro(e instanceof Error ? e.message : "Falha na consulta.")
      })
    return () => controller.abort()
  }, [requisitar, pagina, filtro, revisao])
  return (
    <div className="space-y-6">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setPagina(1)
          setFiltro(busca)
        }}
      >
        <Field className="flex-1">
          <FieldLabel htmlFor="busca-recebivel">
            Buscar pela descrição
          </FieldLabel>
          <Input
            id="busca-recebivel"
            value={busca}
            maxLength={255}
            onChange={(e) => setBusca(e.target.value)}
          />
        </Field>
        <Button type="submit" className="self-end">
          Buscar
        </Button>
        <Button
          type="button"
          variant="outline"
          className="self-end"
          onClick={() => setRevisao((r) => r + 1)}
        >
          Atualizar
        </Button>
      </form>
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      {!lista ? (
        <Skeleton className="h-52 w-full" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título / venda</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Valor original</TableHead>
                  <TableHead>Valor devido</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      #{row.id} / venda #{row.id_venda}
                      <br />
                      {row.descricao}
                    </TableCell>
                    <TableCell>
                      {row.numero_parcela}/{row.total_parcelas}
                    </TableCell>
                    <TableCell>{formatarMoeda(row.valor_original)}</TableCell>
                    <TableCell>{formatarMoeda(row.valor_final)}</TableCell>
                    <TableCell>
                      {row.saldo === null
                        ? "Consultar histórico"
                        : formatarMoeda(row.saldo)}
                    </TableCell>
                    <TableCell>{dataCivil(row.data_vencimento)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.situacao}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        onClick={() => setSelecionado(row.id)}
                      >
                        Histórico e recebimento
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {lista.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>Nenhum título encontrado.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              disabled={pagina === 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </Button>
            <span>
              Página {pagina} de {Math.max(1, lista.totalPages)}
            </span>
            <Button
              variant="outline"
              disabled={pagina >= lista.totalPages}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
      {selecionado !== null && (
        <DetalhesRecebimento
          key={selecionado}
          id={selecionado}
          identidade={identidade}
          aoConfirmar={() => setRevisao((r) => r + 1)}
        />
      )}
    </div>
  )
}

function DetalhesRecebimento({
  id,
  identidade,
  aoConfirmar,
}: {
  id: number
  identidade: string
  aoConfirmar: () => void
}) {
  const { requisitar } = useAutenticacao()
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null)
  const [erro, setErro] = useState("")
  const [processando, setProcessando] = useState(false)
  const bloqueio = useRef(false)
  const [pagina, setPagina] = useState(1)
  const [valor, setValor] = useState("")
  const [data, setData] = useState(hoje)
  const [forma, setForma] = useState<string>("PIX")
  const [conta, setConta] = useState("")
  const [referencia, setReferencia] = useState("")
  const [observacao, setObservacao] = useState("")
  const chaveStorage = `erp-recebimento-pendente:${identidade}:${id}`
  const salvo = useSyncExternalStore(
    assinarRascunho,
    useCallback(() => {
      try {
        return sessionStorage.getItem(chaveStorage)
      } catch {
        return null
      }
    }, [chaveStorage]),
    () => null,
  )
  const tentativa = useMemo<Tentativa | null>(() => {
    try {
      if (!salvo) return null
      const parsed = JSON.parse(salvo) as Tentativa
      const validado = recebimentoSchema.safeParse(parsed.dados)
      return typeof parsed.chave === "string" &&
        /^[A-Za-z0-9._:-]{8,128}$/.test(parsed.chave) &&
        validado.success
        ? { chave: parsed.chave, dados: validado.data }
        : null
    } catch {
      return null
    }
  }, [salvo])
  function atualizarTentativa() {
    window.dispatchEvent(new Event("storage"))
  }
  const carregar = useCallback(
    async (signal?: AbortSignal) => {
      const dados = await obter<Detalhe>(
        await requisitar(
          `/api/contas_receber/${id}/recebimentos?pagina=${pagina}&limite=10`,
          { signal },
        ),
      )
      return dados
    },
    [id, pagina, requisitar],
  )
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      carregar(controller.signal),
      requisitar("/api/contas_receber/opcoes-recebimento", {
        signal: controller.signal,
      }).then(obter<Opcoes>),
    ])
      .then(([titulo, dados]) => {
        if (!controller.signal.aborted) {
          setDetalhe(titulo)
          setValor((v) => v || titulo.saldo)
          setOpcoes(dados)
          setErro("")
        }
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setErro(e instanceof Error ? e.message : "Falha na consulta.")
      })
    return () => controller.abort()
  }, [carregar, requisitar])
  async function confirmar(event: FormEvent) {
    event.preventDefault()
    if (bloqueio.current) return
    const validado = recebimentoSchema.safeParse({
      valor: valor.replace(",", "."),
      data,
      formaPagamento: forma,
      idContaBancaria: Number(conta),
      referencia,
      observacao,
    })
    if (!tentativa && !validado.success) {
      setErro(validado.error.issues.map((i) => i.message).join("; "))
      return
    }
    const envio = tentativa ?? {
      chave: crypto.randomUUID(),
      dados: validado.data!,
    }
    // Salvar antes do envio. Reabrir ou atualizar a página mantém a identidade
    // de uma tentativa cuja resposta pode ter sido interrompida.
    try {
      sessionStorage.setItem(chaveStorage, JSON.stringify(envio))
    } catch {
      setErro(
        "Não foi possível preservar esta confirmação. Habilite o armazenamento da sessão antes de receber.",
      )
      return
    }
    atualizarTentativa()
    bloqueio.current = true
    setProcessando(true)
    setErro("")
    try {
      const resposta = await requisitar(
        `/api/contas_receber/${id}/recebimentos`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": envio.chave,
          },
          body: JSON.stringify(envio.dados),
        },
      )
      const json = await resposta.json()
      if (!resposta.ok) {
        if ([400, 404, 409, 413, 415, 422].includes(resposta.status)) {
          sessionStorage.removeItem(chaveStorage)
          atualizarTentativa()
        }
        throw new Error(
          json.error ?? "Confirmação não comprovada. Repita a mesma tentativa.",
        )
      }
      sessionStorage.removeItem(chaveStorage)
      atualizarTentativa()
      setValor("")
      toast.success("Recebimento confirmado no banco.")
      aoConfirmar()
      const atual = await carregar()
      setDetalhe(atual)
      setValor(atual.saldo)
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : "Resposta interrompida. Repita a mesma tentativa para consultar ou concluir o recebimento com segurança.",
      )
    } finally {
      bloqueio.current = false
      setProcessando(false)
    }
  }
  return (
    <section
      className="space-y-4 rounded-lg border p-4"
      aria-label={`Título ${id}`}
    >
      <h2 className="text-lg font-semibold">Título #{id}</h2>
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      {!detalhe ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <p>
            Parcela {detalhe.parcela}/{detalhe.totalParcelas} · Venda #
            {detalhe.idVenda}{" "}
            {detalhe.idPedido && (
              <>
                ·{" "}
                <Link
                  href={`/vendas/pedidos?pedido=${detalhe.idPedido}`}
                  className="underline"
                >
                  Pedido #{detalhe.idPedido}
                </Link>
              </>
            )}
          </p>
          <p>
            Original: {formatarMoeda(detalhe.valorOriginal)} · Devido:{" "}
            {formatarMoeda(detalhe.valorDevido)} · Recebido:{" "}
            {formatarMoeda(detalhe.valorRecebido)} · Saldo:{" "}
            {formatarMoeda(detalhe.saldo)}
          </p>
          <p>
            Vencimento: {dataCivil(detalhe.vencimento)} · {detalhe.situacao}
            {detalhe.vencido && " · Saldo vencido"}
          </p>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data / registro</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Forma / conta</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Situação / referência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalhe.pagamentos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      {dataCivil(p.data)} / #{p.id}
                    </TableCell>
                    <TableCell>{formatarMoeda(p.valor)}</TableCell>
                    <TableCell>
                      {p.formaPagamento} /{" "}
                      {p.conta ?? "Não registrada no legado"}
                    </TableCell>
                    <TableCell>
                      {p.responsavel ?? "Não registrado no legado"}
                    </TableCell>
                    <TableCell>
                      {p.situacao} {p.referencia}
                      <br />
                      {p.observacao}
                    </TableCell>
                  </TableRow>
                ))}
                {!detalhe.pagamentos.length && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      Nenhum recebimento registrado.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={pagina <= 1 || processando}
              onClick={() => setPagina((p) => p - 1)}
            >
              Histórico anterior
            </Button>
            <Button
              variant="outline"
              disabled={pagina >= detalhe.paginacao.totalPaginas || processando}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima página do histórico
            </Button>
            <Button
              variant="outline"
              disabled={processando}
              onClick={() =>
                carregar()
                  .then(setDetalhe)
                  .catch((e: Error) => setErro(e.message))
              }
            >
              Consultar novamente
            </Button>
          </div>
          {(tentativa ||
            (detalhe.saldo !== "0.00" && detalhe.situacao !== "CANCELADO")) && (
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={confirmar}>
              {tentativa && (
                <Alert className="sm:col-span-2">
                  <AlertDescription>
                    Há uma confirmação pendente de resposta:{" "}
                    {formatarMoeda(tentativa.dados.valor)}, em{" "}
                    {dataCivil(tentativa.dados.data)},{" "}
                    {tentativa.dados.formaPagamento}, conta #
                    {tentativa.dados.idContaBancaria}. Repetir usa os mesmos
                    dados e não cria outro recebimento.
                  </AlertDescription>
                </Alert>
              )}
              <Field>
                <FieldLabel htmlFor="valor-recebimento">
                  Valor recebido
                </FieldLabel>
                <Input
                  id="valor-recebimento"
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  disabled={processando || !!tentativa}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="data-recebimento">
                  Data do recebimento
                </FieldLabel>
                <Input
                  id="data-recebimento"
                  type="date"
                  max={hoje()}
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  disabled={processando || !!tentativa}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="forma-recebimento">
                  Forma de pagamento
                </FieldLabel>
                <Select
                  value={forma}
                  onValueChange={(v) => v && setForma(v)}
                  disabled={processando || !!tentativa}
                >
                  <SelectTrigger id="forma-recebimento">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formasRecebimento.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="conta-recebimento">
                  Conta financeira
                </FieldLabel>
                <Select
                  value={conta}
                  onValueChange={(v) => v && setConta(v)}
                  disabled={processando || !!tentativa}
                >
                  <SelectTrigger id="conta-recebimento">
                    <SelectValue placeholder="Selecione uma conta ativa">
                      {opcoes?.contas.find((c) => String(c.id) === conta)
                        ?.nome ?? "Selecione uma conta ativa"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {opcoes?.contas.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.nome} ({c.tipo.replaceAll("_", " ")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="referencia-recebimento">
                  Referência
                </FieldLabel>
                <Input
                  id="referencia-recebimento"
                  maxLength={100}
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  disabled={processando || !!tentativa}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="observacao-recebimento">
                  Observação
                </FieldLabel>
                <Textarea
                  id="observacao-recebimento"
                  maxLength={255}
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  disabled={processando || !!tentativa}
                />
              </Field>
              <Button
                type="submit"
                disabled={processando || (!tentativa && !opcoes?.contas.length)}
              >
                {processando
                  ? "Confirmando…"
                  : tentativa
                    ? "Repetir a mesma confirmação"
                    : "Confirmar recebimento"}
              </Button>
              {!opcoes?.contas.length && (
                <p className="text-sm text-muted-foreground">
                  Cadastre uma conta financeira ativa nesta empresa para
                  registrar recebimentos.
                </p>
              )}
            </form>
          )}
        </>
      )}
    </section>
  )
}

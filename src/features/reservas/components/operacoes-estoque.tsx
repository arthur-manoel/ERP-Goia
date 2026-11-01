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
  type ReactNode,
} from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { formatarDataHora, formatarQuantidade } from "@/lib/formatacao"
import {
  quantidade as quantidadeOperacional,
  entregaSchema,
  consumoSchema,
} from "@/modules/reservas/reservas.schema"

type Origem = "PEDIDO" | "PRODUCAO" | "RESERVAS"
type Variacao = {
  id: number
  cores: { nome: string } | null
  tamanhos: { nome: string } | null
}
type Reserva = {
  id: number
  id_produto: number
  id_variacao: number | null
  id_pedido_cliente_item: number | null
  id_ordem_producao: number | null
  id_local_estoque: number
  quantidade: string
  quantidade_consumida: string
  quantidade_liberada: string
  restante: string
  status: string
  protocolo_integrado: boolean
  data_reserva: string
  usuarios: { nome: string }
  produtos: { nome: string; unidade: string }
  locais_estoque: { nome: string } | null
  produto_variacoes: Variacao | null
  pedido_cliente_item: { id_pedido_cliente: number } | null
}
type Produto = {
  id: number
  nome: string
  unidade: string
  produto_variacoes: Variacao[]
  estoque: {
    id_local_estoque: number
    id_setor: number
    quantidade: string
    quantidade_reservada: string
    estoque_variacao: {
      id_variacao: number
      quantidade: string
      quantidade_reservada: string
    }[]
  }[]
}
type Opcoes = {
  produtos: Produto[]
  locais: { id: number; nome: string }[]
  setores: { id: number; nome: string }[]
}
type Documento = { id: number; numero: string; status: string }
type Pedido = Documento & {
  versao: number
  pedido_cliente_fechamento: { id: number }[]
  pedido_cliente_item: {
    id: number
    id_produto: number
    id_variacao: number | null
    descricao: string
    unidade: string
    quantidade: string
    reserva_estoque: Reserva[]
    pedido_cliente_entrega_item: {
      quantidade: string
      pedido_cliente_entrega: { status: string }
    }[]
  }[]
}
type Ordem = Documento & {
  id_local_estoque: number | null
  id_setor: number | null
  ordem_producao_item: {
    id: number
    id_produto: number
    quantidade: string
    quantidade_produzida: string
    produtos: { nome: string; unidade: string }
  }[]
  ordem_producao_consumo_planejado: {
    id_materia_prima: number
    quantidade_necessaria: string
    produtos: { nome: string; unidade: string }
  }[]
  necessidade_producao: {
    id_produto: number
    quantidade_necessaria: string
    quantidade_reservada: string
    quantidade_consumida: string
    consumo_confirmado_em: string | null
  }[]
  reserva_estoque: Reserva[]
  ordem_producao_fluxo_setor: {
    id: number
    id_setor: number
    ordem: number
    status: string
  }[]
}
type Pendente = {
  url: string
  metodo: string
  body: unknown
  chave: string
  headers?: Record<string, string>
}
type Api = ReturnType<typeof useAutenticacao>["requisitar"]
const grade = (v: Variacao | null) =>
  v
    ? [v.cores?.nome, v.tamanhos?.nome].filter(Boolean).join(" / ") ||
      "Sem cor e tamanho"
    : "Sem grade"
const saldoReserva = (r: Reserva) =>
  Number(r.quantidade) -
  Number(r.quantidade_consumida) -
  Number(r.quantidade_liberada)
const assinar = (fn: () => void) => {
  window.addEventListener("storage", fn)
  return () => window.removeEventListener("storage", fn)
}
async function json<T>(response: Response): Promise<T> {
  const value = await response.json()
  if (!response.ok)
    throw new Error(value.error ?? "Não foi possível consultar os dados.")
  return (value.data ?? value) as T
}
function useConsulta<T>(url: string | null, requisitar: Api, revisao: number) {
  const [estado, setEstado] = useState<{
    url?: string
    dados: T | null
    erro: string
  }>({
    dados: null,
    erro: "",
  })
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    requisitar(url, { signal: controller.signal })
      .then(json<T>)
      .then((dados) => {
        if (!controller.signal.aborted) setEstado({ url, dados, erro: "" })
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setEstado({
            url,
            dados: null,
            erro: e instanceof Error ? e.message : "Falha na consulta.",
          })
      })
    return () => controller.abort()
  }, [url, requisitar, revisao])
  return estado.url === url ? estado : { dados: null, erro: "" }
}
function Seletor({
  titulo,
  valor,
  alterar,
  opcoes,
}: {
  titulo: string
  valor: string
  alterar: (v: string) => void
  opcoes: { value: string; label: string }[]
}) {
  return (
    <SearchSelect
      label={titulo}
      value={valor}
      onValueChange={alterar}
      options={opcoes}
      placeholder={`Selecione ${titulo.toLowerCase()}`}
    />
  )
}
function Campo({
  nome,
  titulo,
  inicial,
  tipo = "text",
  obrigatorio = true,
}: {
  nome: string
  titulo: string
  inicial?: string
  tipo?: string
  obrigatorio?: boolean
}) {
  return (
    <Field>
      <FieldLabel htmlFor={nome}>{titulo}</FieldLabel>
      <Input
        id={nome}
        name={nome}
        type={tipo}
        defaultValue={inicial}
        required={obrigatorio}
      />
    </Field>
  )
}

export function OperacoesEstoque({ origem = "RESERVAS" }: { origem?: Origem }) {
  const { estado, usuario, empresa, empresas, selecionarEmpresa } =
    useAutenticacao()
  return (
    <>
      <PageHeader
        titulo={
          origem === "PEDIDO"
            ? "Pedidos e entregas"
            : origem === "PRODUCAO"
              ? "Produção e estoque"
              : "Reservas de estoque"
        }
        descricao="Consulte os documentos e confirme as operações da empresa ativa."
      />
      {empresas.length > 1 && (
        <Seletor
          titulo="Empresa ativa"
          valor={empresa ? String(empresa.id) : ""}
          alterar={(v) => selecionarEmpresa(Number(v))}
          opcoes={empresas.map((e) => ({ value: String(e.id), label: e.nome }))}
        />
      )}
      {estado === "carregando" ? (
        <Skeleton className="h-64 w-full" />
      ) : estado !== "autenticado" || !empresa ? (
        <Alert>
          <AlertDescription>
            Entre na sua conta e selecione uma empresa.
          </AlertDescription>
        </Alert>
      ) : (
        <Conteudo
          key={`${usuario?.email}:${empresa.id}:${origem}`}
          origem={origem}
          identidade={`${usuario?.email}:${empresa.id}`}
        />
      )}
    </>
  )
}

function Conteudo({
  origem,
  identidade,
}: {
  origem: Origem
  identidade: string
}) {
  const { requisitar } = useAutenticacao()
  const [revisao, setRevisao] = useState(0)
  const [erro, setErro] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const trava = useRef(false)
  const chaveStorage = `erp-operacao-estoque:${identidade}`
  const armazenado = useSyncExternalStore(
    assinar,
    useCallback(() => {
      try {
        return sessionStorage.getItem(chaveStorage)
      } catch {
        return null
      }
    }, [chaveStorage]),
    () => null,
  )
  const pendente = useMemo<Pendente | null>(() => {
    try {
      const v = armazenado ? (JSON.parse(armazenado) as Pendente) : null
      return v &&
        typeof v.url === "string" &&
        v.url.startsWith("/api/") &&
        typeof v.chave === "string" &&
        ["POST", "PUT"].includes(v.metodo)
        ? v
        : null
    } catch {
      return null
    }
  }, [armazenado])
  const [buscaProduto, setBuscaProduto] = useState("")
  const { dados: opcoes, erro: erroOpcoes } = useConsulta<Opcoes>(
    `/api/estoque/reservas/opcoes?busca=${encodeURIComponent(buscaProduto)}`,
    requisitar,
    revisao,
  )
  async function enviar(
    url: string,
    body: unknown,
    metodo = "POST",
    headers?: Record<string, string>,
  ) {
    if (trava.current) return
    const tentativa = pendente ?? {
      url,
      body,
      metodo,
      chave: crypto.randomUUID(),
      headers,
    }
    try {
      sessionStorage.setItem(chaveStorage, JSON.stringify(tentativa))
      window.dispatchEvent(new Event("storage"))
    } catch {
      setErro(
        "Habilite o armazenamento da sessão para preservar a confirmação antes do envio.",
      )
      return
    }
    trava.current = true
    setOcupado(true)
    setErro("")
    try {
      const resposta = await requisitar(tentativa.url, {
        method: tentativa.metodo,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": tentativa.chave,
          ...tentativa.headers,
        },
        body: JSON.stringify(tentativa.body),
      })
      const value = await resposta.json()
      if (!resposta.ok) {
        if ([400, 404, 409, 413, 415, 422].includes(resposta.status)) {
          sessionStorage.removeItem(chaveStorage)
          window.dispatchEvent(new Event("storage"))
          setRevisao((r) => r + 1)
        }
        throw new Error(
          value.error ?? "Confirmação interrompida; repita a mesma tentativa.",
        )
      }
      sessionStorage.removeItem(chaveStorage)
      window.dispatchEvent(new Event("storage"))
      toast.success("Operação confirmada no banco.")
      setRevisao((r) => r + 1)
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : "Resposta interrompida. Repita a mesma confirmação para evitar duplicidade.",
      )
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }
  const bloqueado = ocupado || !!pendente
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <Link href="/estoque/reservas" className="underline">
          Reservas e transferências
        </Link>
        <Link href="/vendas/pedidos" className="underline">
          Pedidos e entregas
        </Link>
        <Link href="/producao/ordens" className="underline">
          Produção e consumo
        </Link>
        <Link href="/financeiro/contas-receber" className="underline">
          Contas a receber
        </Link>
        <Button
          variant="outline"
          disabled={ocupado}
          onClick={() => setRevisao((r) => r + 1)}
        >
          Atualizar dados
        </Button>
      </div>
      {(erro || erroOpcoes) && (
        <Alert variant="destructive">
          <AlertDescription>{erro || erroOpcoes}</AlertDescription>
        </Alert>
      )}
      {pendente && (
        <Alert>
          <AlertDescription>
            Uma confirmação ficou sem resposta conclusiva. Os dados dessa
            tentativa foram preservados.{" "}
            <Button
              disabled={ocupado}
              onClick={() =>
                enviar(pendente.url, pendente.body, pendente.metodo)
              }
            >
              Repetir a mesma confirmação
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <Field>
        <FieldLabel htmlFor="busca-produto-operacao">
          Buscar produto para as operações
        </FieldLabel>
        <Input
          id="busca-produto-operacao"
          value={buscaProduto}
          maxLength={100}
          onChange={(e) => setBuscaProduto(e.target.value)}
          placeholder="Nome do produto; até 50 resultados por busca"
        />
      </Field>
      {!opcoes ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          {origem !== "RESERVAS" && (
            <DocumentoOperacional
              key={origem}
              origem={origem}
              requisitar={requisitar}
              revisao={revisao}
              opcoes={opcoes}
              bloqueado={bloqueado}
              enviar={enviar}
            />
          )}
          <Reservas
            requisitar={requisitar}
            revisao={revisao}
            bloqueado={bloqueado}
            enviar={enviar}
          />
          {origem === "RESERVAS" && (
            <Transferencias
              requisitar={requisitar}
              revisao={revisao}
              opcoes={opcoes}
              bloqueado={bloqueado}
              enviar={enviar}
            />
          )}
        </>
      )}
    </div>
  )
}
type Enviar = (
  url: string,
  body: unknown,
  metodo?: string,
  headers?: Record<string, string>,
) => Promise<void>
function Caixa({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  )
}

function Reservas({
  requisitar,
  revisao,
  bloqueado,
  enviar,
}: {
  requisitar: Api
  revisao: number
  bloqueado: boolean
  enviar: Enviar
}) {
  const [pagina, setPagina] = useState(1)
  const [origem, setOrigem] = useState("")
  const [status, setStatus] = useState("")
  const [busca, setBusca] = useState("")
  const [detalhe, setDetalhe] = useState<number | null>(null)
  const [historicoPagina, setHistoricoPagina] = useState(1)
  const params = new URLSearchParams({
    pagina: String(pagina),
    limite: "25",
    ...(origem ? { origem } : {}),
    ...(status ? { status } : {}),
    ...(busca ? { busca } : {}),
  })
  const consulta = useConsulta<{ dados: Reserva[]; totalPaginas: number }>(
    `/api/estoque/reservas?${params}`,
    requisitar,
    revisao,
  )
  const historico = useConsulta<{
    reserva: Reserva
    restante: string
    total: number
    historico: {
      id: number
      data_evento: string
      id_usuario: number
      usuarios: { nome: string } | null
      dados_novos: string
    }[]
  }>(
    detalhe
      ? `/api/estoque/reservas/${detalhe}?pagina=${historicoPagina}`
      : null,
    requisitar,
    revisao,
  )
  return (
    <Caixa titulo="Reservas">
      <div className="grid gap-3 sm:grid-cols-3">
        <Seletor
          titulo="Origem"
          valor={origem}
          alterar={(v) => {
            setOrigem(v)
            setPagina(1)
          }}
          opcoes={[
            { value: "", label: "Todas" },
            { value: "PEDIDO", label: "Pedido" },
            { value: "PRODUCAO", label: "Produção" },
          ]}
        />
        <Seletor
          titulo="Situação"
          valor={status}
          alterar={(v) => {
            setStatus(v)
            setPagina(1)
          }}
          opcoes={[
            { value: "", label: "Todas" },
            ...["ATIVA", "ATENDIDA", "CANCELADA"].map((s) => ({
              value: s,
              label: s,
            })),
          ]}
        />
        <Field>
          <FieldLabel htmlFor="busca-reserva">Buscar produto</FieldLabel>
          <Input
            id="busca-reserva"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(1)
            }}
            maxLength={100}
          />
        </Field>
      </div>
      {consulta.erro && (
        <Alert variant="destructive">
          <AlertDescription>{consulta.erro}</AlertDescription>
        </Alert>
      )}
      {consulta.dados && (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Origem",
                    "Produto / variação",
                    "Local",
                    "Reservada / consumida / liberada / restante",
                    "Situação",
                    "Data / responsável",
                    "Detalhes",
                  ].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {consulta.dados.dados.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        className="underline"
                        href={
                          r.id_ordem_producao
                            ? `/producao/ordens?ordem=${r.id_ordem_producao}`
                            : `/vendas/pedidos?pedido=${r.pedido_cliente_item?.id_pedido_cliente ?? ""}`
                        }
                      >
                        {r.id_ordem_producao
                          ? `OP ${r.id_ordem_producao}`
                          : `Pedido ${r.pedido_cliente_item?.id_pedido_cliente ?? "legado"}`}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {r.produtos.nome}
                      <br />
                      {grade(r.produto_variacoes)} · {r.produtos.unidade}
                    </TableCell>
                    <TableCell>{r.locais_estoque?.nome}</TableCell>
                    <TableCell>
                      {r.protocolo_integrado
                        ? [
                            r.quantidade,
                            r.quantidade_consumida,
                            r.quantidade_liberada,
                            r.restante,
                          ]
                            .map((q) => formatarQuantidade(q))
                            .join(" / ")
                        : "Registro legado sem detalhamento"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {formatarDataHora(new Date(r.data_reserva))}
                      <br />
                      {r.usuarios.nome}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setDetalhe(r.id)
                          setHistoricoPagina(1)
                        }}
                      >
                        Ver reserva
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!consulta.dados.dados.length && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      Nenhuma reserva encontrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </Button>
            <span>Página {pagina}</span>
            <Button
              variant="outline"
              disabled={pagina >= consulta.dados.totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
      {detalhe && (
        <div className="space-y-3 rounded-lg border p-3">
          <h3 className="font-semibold">Reserva #{detalhe}</h3>
          {historico.erro && <p role="alert">{historico.erro}</p>}
          {historico.dados && (
            <>
              <p>
                Quantidade restante:{" "}
                {formatarQuantidade(historico.dados.restante)}
              </p>
              {historico.dados.historico.map((h) => {
                let evento: { evento?: string; motivo?: string } = {}
                try {
                  evento = JSON.parse(h.dados_novos) as typeof evento
                } catch {
                  /* Histórico legado permanece disponível no banco. */
                }
                return (
                  <p key={h.id}>
                    {formatarDataHora(new Date(h.data_evento))} ·{" "}
                    {h.usuarios?.nome ?? "Responsável não registrado no legado"}{" "}
                    · {evento.evento ?? "Reserva registrada"}{" "}
                    {evento.motivo && `· ${evento.motivo}`}
                  </p>
                )
              })}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={historicoPagina <= 1}
                  onClick={() => setHistoricoPagina((p) => p - 1)}
                >
                  Histórico anterior
                </Button>
                <Button
                  variant="outline"
                  disabled={historicoPagina * 25 >= historico.dados.total}
                  onClick={() => setHistoricoPagina((p) => p + 1)}
                >
                  Mais histórico
                </Button>
              </div>
              {historico.dados.reserva.protocolo_integrado &&
                historico.dados.reserva.status === "ATIVA" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const fd = new FormData(e.currentTarget)
                      void enviar(`/api/estoque/reservas/${detalhe}/liberar`, {
                        quantidade: String(
                          fd.get("liberar-quantidade"),
                        ).replace(",", "."),
                        motivo: fd.get("liberar-motivo"),
                      })
                    }}
                  >
                    <fieldset
                      disabled={bloqueado}
                      className="grid gap-3 sm:grid-cols-3"
                    >
                      <Campo
                        nome="liberar-quantidade"
                        titulo="Quantidade a liberar"
                      />
                      <Campo
                        nome="liberar-motivo"
                        titulo="Motivo da liberação"
                      />
                      <Button type="submit" className="self-end">
                        Liberar saldo da reserva
                      </Button>
                    </fieldset>
                  </form>
                )}
            </>
          )}
        </div>
      )}
    </Caixa>
  )
}

function DocumentoOperacional({
  origem,
  requisitar,
  revisao,
  opcoes,
  bloqueado,
  enviar,
}: {
  origem: Exclude<Origem, "RESERVAS">
  requisitar: Api
  revisao: number
  opcoes: Opcoes
  bloqueado: boolean
  enviar: Enviar
}) {
  const [busca, setBusca] = useState("")
  const [pagina, setPagina] = useState(1)
  const [escolhido, setId] = useState("")
  const urlInicial = useSyncExternalStore(
    useCallback((fn) => {
      window.addEventListener("popstate", fn)
      return () => window.removeEventListener("popstate", fn)
    }, []),
    useCallback(
      () =>
        new URL(window.location.href).searchParams.get(
          origem === "PEDIDO" ? "pedido" : "ordem",
        ) ?? "",
      [origem],
    ),
    () => "",
  )
  const id = escolhido || urlInicial
  const url =
    origem === "PEDIDO"
      ? `/api/pedidos?pagina=${pagina}&limite=25&busca=${encodeURIComponent(busca)}`
      : `/api/ordem_producao?page=${pagina}&limit=25&busca=${encodeURIComponent(busca)}`
  const lista = useConsulta<{
    dados?: { idPedido: number; numero: string; status: string }[]
    paginacao?: { totalPaginas: number }
    rows?: Documento[]
    totalPages?: number
  }>(url, requisitar, revisao)
  const detalhes = useConsulta<Pedido | Ordem>(
    id
      ? `/api/${origem === "PEDIDO" ? "pedidos" : "ordem_producao"}/${id}/operacao`
      : null,
    requisitar,
    revisao,
  )
  const rows =
    lista.dados?.rows ??
    lista.dados?.dados?.map((p) => ({
      id: p.idPedido,
      numero: p.numero,
      status: p.status,
    })) ??
    []
  return (
    <Caixa
      titulo={
        origem === "PEDIDO"
          ? "Confirmar pedido, reservar e entregar"
          : "Registrar consumo e concluir produção"
      }
    >
      <Field>
        <FieldLabel htmlFor="buscar-documento">
          Buscar número do documento
        </FieldLabel>
        <Input
          id="buscar-documento"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setPagina(1)
          }}
          maxLength={50}
        />
      </Field>
      {lista.erro && <p role="alert">{lista.erro}</p>}
      <Seletor
        titulo={origem === "PEDIDO" ? "Pedido" : "Ordem de produção"}
        valor={id}
        alterar={setId}
        opcoes={rows.map((d) => ({
          value: String(d.id),
          label: `${d.numero} · ${d.status}`,
        }))}
      />
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={pagina <= 1}
          onClick={() => setPagina((p) => p - 1)}
        >
          Anterior
        </Button>
        <span>Página {pagina}</span>
        <Button
          variant="outline"
          disabled={
            pagina >=
            (lista.dados?.totalPages ??
              lista.dados?.paginacao?.totalPaginas ??
              0)
          }
          onClick={() => setPagina((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
      {detalhes.erro && (
        <Alert variant="destructive">
          <AlertDescription>{detalhes.erro}</AlertDescription>
        </Alert>
      )}
      {id && detalhes.dados && (
        <DetalheDocumento
          requisitar={requisitar}
          revisao={revisao}
          key={id}
          origem={origem}
          documento={detalhes.dados}
          opcoes={opcoes}
          bloqueado={bloqueado}
          enviar={enviar}
        />
      )}
    </Caixa>
  )
}

function DetalheDocumento({
  requisitar,
  revisao,
  origem,
  documento,
  opcoes,
  bloqueado,
  enviar,
}: {
  requisitar: Api
  revisao: number
  origem: "PEDIDO" | "PRODUCAO"
  documento: Pedido | Ordem
  opcoes: Opcoes
  bloqueado: boolean
  enviar: Enviar
}) {
  const [item, setItem] = useState("")
  const [local, setLocal] = useState("")
  const [variacao, setVariacao] = useState("")
  const [reservaConsumo, setReservaConsumo] = useState("")
  const [erroLocal, setErroLocal] = useState("")
  const pedido = origem === "PEDIDO" ? (documento as Pedido) : null
  const ordem = origem === "PRODUCAO" ? (documento as Ordem) : null
  const pedidoOperacional = pedido
    ? [
        "RASCUNHO",
        "CONFIRMADO",
        "EM_PRODUCAO",
        "PRONTO",
        "EM_ENTREGA",
        "PARCIALMENTE_ENTREGUE",
      ].includes(pedido.status)
    : false
  const podeReservar = pedido
    ? pedidoOperacional
    : Boolean(
        ordem &&
        ["LIBERADA", "EM_PRODUCAO", "PAUSADA", "AGUARDANDO_MATERIAL"].includes(
          ordem.status,
        ),
      )
  const podeConcluir = Boolean(
    ordem &&
    ordem.status === "EM_PRODUCAO" &&
    ordem.ordem_producao_item.length &&
    ordem.ordem_producao_item.every(
      (i) => Number(i.quantidade_produzida) > 0,
    ) &&
    ordem.ordem_producao_consumo_planejado.every((m) =>
      ordem.necessidade_producao.some(
        (n) => n.id_produto === m.id_materia_prima && n.consumo_confirmado_em,
      ),
    ),
  )
  const escolhas = pedido
    ? pedido.pedido_cliente_item.map((i) => ({
        value: String(i.id),
        label: `${i.descricao} · ${i.unidade}`,
      }))
    : [
        ...new Map(
          ordem!.ordem_producao_consumo_planejado.map((p) => [
            p.id_materia_prima,
            {
              value: String(p.id_materia_prima),
              label: `${p.produtos.nome} · ${p.produtos.unidade}`,
            },
          ]),
        ).values(),
      ]
  const linha = pedido?.pedido_cliente_item.find((i) => String(i.id) === item)
  const produtoId = linha?.id_produto ?? Number(item)
  const produto = opcoes.produtos.find((p) => p.id === produtoId)
  const posicao = produto?.estoque.find(
    (e) => e.id_local_estoque === Number(local),
  )
  const gradePosicao = posicao?.estoque_variacao.find(
    (v) => v.id_variacao === (linha?.id_variacao ?? Number(variacao)),
  )
  const usaGrade = Boolean(linha?.id_variacao || variacao)
  const fisicoSelecionado = usaGrade
    ? (gradePosicao?.quantidade ?? "0")
    : posicao
      ? Number(posicao.quantidade) -
        posicao.estoque_variacao.reduce((s, v) => s + Number(v.quantidade), 0)
      : "0"
  const reservadoSelecionado = usaGrade
    ? (gradePosicao?.quantidade_reservada ?? "0")
    : posicao
      ? Number(posicao.quantidade_reservada) -
        posicao.estoque_variacao.reduce(
          (s, v) => s + Number(v.quantidade_reservada),
          0,
        )
      : "0"
  const reservas = pedido
    ? pedido.pedido_cliente_item.flatMap((i) =>
        i.reserva_estoque.map((r) => ({
          ...r,
          nomeItem: i.descricao,
          idItem: i.id,
        })),
      )
    : ordem!.reserva_estoque.map((r) => ({
        ...r,
        nomeItem:
          opcoes.produtos.find((p) => p.id === r.id_produto)?.nome ??
          `Material ${r.id_produto}`,
        idItem: 0,
      }))
  async function reservar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const q = String(fd.get("reservar-quantidade")).replace(",", ".")
    const validado = quantidadeOperacional.safeParse(q)
    if (!validado.success) {
      setErroLocal(validado.error.issues[0].message)
      return
    }
    if (Number(q) > Number(fisicoSelecionado) - Number(reservadoSelecionado)) {
      setErroLocal(
        "A quantidade excede o disponível nesta variação e local. O pedido pode permanecer em planejamento com saldo pendente.",
      )
      return
    }
    setErroLocal("")
    const dados = {
      origem,
      idOrigem: documento.id,
      ...(pedido ? { idItem: Number(item) } : {}),
      idProduto: produtoId,
      ...(linha?.id_variacao || variacao
        ? { idVariacao: linha?.id_variacao ?? Number(variacao) }
        : {}),
      idLocalEstoque: Number(local),
      quantidade: q,
    }
    await enviar(
      pedido?.status === "RASCUNHO"
        ? `/api/pedidos/${documento.id}/confirmar`
        : "/api/estoque/reservas",
      pedido?.status === "RASCUNHO" ? { reservas: [dados] } : dados,
    )
  }
  return (
    <div className="space-y-5">
      {erroLocal && (
        <Alert variant="destructive">
          <AlertDescription>{erroLocal}</AlertDescription>
        </Alert>
      )}
      <p className="font-semibold">
        {documento.numero} · {documento.status}
      </p>
      {pedido && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Pedido / reservado / pendente de reserva</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pedido.pedido_cliente_item.map((i) => {
              const entregue = i.pedido_cliente_entrega_item
                .filter(
                  (e) =>
                    !["CANCELADA", "PREPARANDO", "NAO_ENTREGUE"].includes(
                      e.pedido_cliente_entrega.status,
                    ),
                )
                .reduce((s, e) => s + Number(e.quantidade), 0)
              const reservado = i.reserva_estoque
                .filter((r) => r.status === "ATIVA")
                .reduce((s, r) => s + saldoReserva(r), 0)
              return (
                <TableRow key={i.id}>
                  <TableCell>
                    {i.descricao} · {i.unidade}
                  </TableCell>
                  <TableCell>
                    {formatarQuantidade(i.quantidade)} /{" "}
                    {formatarQuantidade(reservado)} /{" "}
                    {formatarQuantidade(
                      Math.max(0, Number(i.quantidade) - entregue - reservado),
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      <form onSubmit={reservar}>
        <fieldset
          disabled={bloqueado || !podeReservar}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Seletor
            titulo={pedido ? "Item do pedido" : "Material previsto"}
            valor={item}
            alterar={(v) => {
              setItem(v)
              setVariacao("")
              setLocal("")
            }}
            opcoes={escolhas}
          />
          <Seletor
            titulo="Local da reserva"
            valor={local}
            alterar={setLocal}
            opcoes={opcoes.locais.map((l) => ({
              value: String(l.id),
              label: l.nome,
            }))}
          />
          {!pedido && produto?.produto_variacoes.length ? (
            <Seletor
              titulo="Variação do insumo"
              valor={variacao}
              alterar={setVariacao}
              opcoes={produto.produto_variacoes.map((v) => ({
                value: String(v.id),
                label: grade(v),
              }))}
            />
          ) : null}
          <Campo nome="reservar-quantidade" titulo="Quantidade a reservar" />
          <p className="text-sm text-muted-foreground">
            {posicao
              ? `Físico nesta variação: ${formatarQuantidade(fisicoSelecionado)} · reservado: ${formatarQuantidade(reservadoSelecionado)} · disponível: ${formatarQuantidade(Number(fisicoSelecionado) - Number(reservadoSelecionado))}`
              : "Selecione um produto e local com posição física. A confirmação final confere o saldo disponível."}
          </p>
          <Button type="submit" disabled={!item || !local}>
            {pedido?.status === "RASCUNHO"
              ? "Confirmar pedido com esta reserva"
              : "Reservar quantidade informada"}
          </Button>
        </fieldset>
      </form>
      {pedido?.status === "RASCUNHO" && (
        <div className="space-y-2">
          <p>
            Para planejamento sem estoque disponível, a confirmação mantém os
            itens pendentes de reserva.
          </p>
          <Button
            disabled={bloqueado}
            variant="outline"
            onClick={() =>
              enviar(`/api/pedidos/${pedido.id}/confirmar`, { reservas: [] })
            }
          >
            Confirmar para planejamento, sem reserva
          </Button>
        </div>
      )}
      {pedido && pedidoOperacional && pedido.status !== "RASCUNHO" && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const itens = reservas
              .filter(
                (r) =>
                  r.status === "ATIVA" &&
                  Number(
                    String(fd.get(`entregar-${r.id}`) ?? "0").replace(",", "."),
                  ) > 0,
              )
              .map((r) => ({
                idItem: r.idItem,
                idReserva: r.id,
                quantidade: String(fd.get(`entregar-${r.id}`)).replace(
                  ",",
                  ".",
                ),
              }))
            const dados = {
              nomeRecebedor: fd.get("nome-recebedor"),
              itens,
            }
            const validado = entregaSchema.safeParse(dados)
            if (!validado.success) {
              setErroLocal(validado.error.issues[0].message)
              return
            }
            if (
              itens.some(
                (i) =>
                  Number(i.quantidade) >
                  saldoReserva(reservas.find((r) => r.id === i.idReserva)!),
              )
            ) {
              setErroLocal(
                "A quantidade entregue excede o restante de uma reserva. Consulte novamente antes de confirmar.",
              )
              return
            }
            setErroLocal("")
            void enviar(`/api/pedidos/${pedido.id}/entregas`, validado.data)
          }}
        >
          <fieldset disabled={bloqueado} className="space-y-3">
            <h3 className="font-semibold">
              Confirmar entrega recebida pelo cliente
            </h3>
            <p>
              Informe somente o que foi efetivamente entregue. A saída e o
              consumo da reserva serão confirmados juntos.
            </p>
            <Campo nome="nome-recebedor" titulo="Nome do recebedor" />
            {reservas
              .filter((r) => r.status === "ATIVA")
              .map((r) => (
                <Campo
                  key={r.id}
                  nome={`entregar-${r.id}`}
                  titulo={`${r.nomeItem} · reserva ${r.id} · ${opcoes.locais.find((l) => l.id === r.id_local_estoque)?.nome ?? "Local da reserva"} · restante ${formatarQuantidade(saldoReserva(r))}`}
                  inicial="0"
                  obrigatorio={false}
                />
              ))}
            <Button
              type="submit"
              disabled={!reservas.some((r) => r.status === "ATIVA")}
            >
              Confirmar entrega e saída física
            </Button>
          </fieldset>
        </form>
      )}
      {pedido && ["ENTREGUE", "CONCLUIDO"].includes(pedido.status) && (
        <FecharPedido
          pedido={pedido}
          requisitar={requisitar}
          revisao={revisao}
          bloqueado={bloqueado}
          enviar={enviar}
        />
      )}
      {ordem && (
        <>
          <div className="flex flex-wrap gap-2">
            {(["liberar", "iniciar", "pausar", "retomar"] as const).map(
              (acao) => (
                <Button
                  key={acao}
                  variant="outline"
                  disabled={
                    bloqueado ||
                    ordem.status !==
                      {
                        liberar: "PLANEJADA",
                        iniciar: "LIBERADA",
                        pausar: "EM_PRODUCAO",
                        retomar: "PAUSADA",
                      }[acao]
                  }
                  onClick={() =>
                    enviar(`/api/ordem_producao/${ordem.id}/${acao}`, {})
                  }
                >
                  {acao[0].toUpperCase() + acao.slice(1)} OP
                </Button>
              ),
            )}
          </div>
          <h3 className="font-semibold">Consumo real dos materiais</h3>
          <p>
            Material não utilizado: informe zero, encerre o consumo e
            justifique. A sobra será liberada sem saída física.
          </p>
          {ordem.necessidade_producao.map((n) => (
            <p key={n.id_produto}>
              {opcoes.produtos.find((p) => p.id === n.id_produto)?.nome ??
                `Material ${n.id_produto}`}{" "}
              · previsto {formatarQuantidade(n.quantidade_necessaria)} ·
              reservado {formatarQuantidade(n.quantidade_reservada)} · consumido{" "}
              {formatarQuantidade(n.quantidade_consumida)} ·{" "}
              {n.consumo_confirmado_em
                ? "Consumo encerrado"
                : "Consumo pendente"}
            </p>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const motivo = String(fd.get("motivo-divergencia") ?? "").trim()
              const validado = consumoSchema.safeParse({
                idReserva: Number(reservaConsumo),
                quantidade: String(fd.get("consumir-quantidade")).replace(
                  ",",
                  ".",
                ),
                concluirConsumo: fd.get("consumo-concluido") === "on",
                ...(motivo ? { motivoDivergencia: motivo } : {}),
              })
              if (!validado.success) {
                toast.error(
                  "Informe o consumo com até três casas decimais. Zero exige encerramento e motivo.",
                )
                return
              }
              void enviar(
                `/api/ordem_producao/${ordem.id}/consumos`,
                validado.data,
              )
            }}
          >
            <fieldset
              disabled={bloqueado}
              className="grid gap-3 sm:grid-cols-2"
            >
              <Seletor
                titulo="Reserva do material consumido"
                valor={reservaConsumo}
                alterar={setReservaConsumo}
                opcoes={reservas
                  .filter((r) => r.status === "ATIVA")
                  .map((r) => ({
                    value: String(r.id),
                    label: `${r.nomeItem} · reserva ${r.id} · restante ${formatarQuantidade(saldoReserva(r))}`,
                  }))}
              />
              <Campo
                nome="consumir-quantidade"
                titulo="Quantidade efetivamente consumida"
              />
              <Campo
                nome="motivo-divergencia"
                titulo="Motivo da diferença em relação ao previsto"
                obrigatorio={false}
              />
              <label className="flex items-center gap-2">
                <input type="checkbox" name="consumo-concluido" />
                Este registro encerra o consumo deste material; liberar a sobra
                reservada
              </label>
              <Button
                type="submit"
                disabled={
                  !reservas.some(
                    (r) =>
                      r.id === Number(reservaConsumo) && r.status === "ATIVA",
                  )
                }
              >
                Registrar consumo e saída do material
              </Button>
            </fieldset>
          </form>
          <h3 className="font-semibold">Etapas da produção</h3>
          {ordem.ordem_producao_fluxo_setor.map((etapa) => (
            <div key={etapa.id} className="flex flex-wrap items-center gap-3">
              <span>
                {etapa.ordem} ·{" "}
                {opcoes.setores.find((s) => s.id === etapa.id_setor)?.nome ??
                  "Setor"}{" "}
                · {etapa.status}
              </span>
              {etapa.status !== "CONCLUIDA" && (
                <Button
                  variant="outline"
                  disabled={
                    bloqueado ||
                    ordem.status !== "EM_PRODUCAO" ||
                    etapa.id !==
                      ordem.ordem_producao_fluxo_setor.find(
                        (e) => e.status !== "CONCLUIDA",
                      )?.id ||
                    (etapa.id === ordem.ordem_producao_fluxo_setor.at(-1)?.id &&
                      etapa.status === "EM_PRODUCAO" &&
                      !podeConcluir)
                  }
                  onClick={() =>
                    enviar(
                      `/api/ordem_producao/${ordem.id}/etapas/${etapa.id}/${etapa.status === "PENDENTE" ? "iniciar" : "concluir"}`,
                      {},
                    )
                  }
                >
                  {etapa.status === "PENDENTE"
                    ? "Iniciar etapa"
                    : "Concluir etapa"}
                </Button>
              )}
            </div>
          ))}
          <h3 className="font-semibold">
            Produção efetiva e entrada de produtos prontos
          </h3>
          <p>
            Destino físico configurado da fábrica:{" "}
            {opcoes.locais.find((l) => l.id === ordem.id_local_estoque)?.nome ??
              "Defina o local da OP antes de iniciar"}
            . A chegada à loja depende de transferência recebida.
          </p>
          {ordem.ordem_producao_item.map((i) => (
            <form
              key={`${i.id}:${i.quantidade_produzida}`}
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                void enviar(
                  `/api/ordem_producao/${ordem.id}/itens/${i.id}/producao`,
                  {
                    quantidade_produzida: String(
                      fd.get(`produzido-${i.id}`),
                    ).replace(",", "."),
                    quantidade_esperada: i.quantidade_produzida,
                  },
                  "PUT",
                )
              }}
            >
              <fieldset
                disabled={
                  bloqueado ||
                  ordem.status !== "EM_PRODUCAO" ||
                  (ordem.ordem_producao_fluxo_setor.length > 0 &&
                    ordem.ordem_producao_fluxo_setor.at(-1)?.status !==
                      "EM_PRODUCAO")
                }
                className="flex flex-wrap items-end gap-3"
              >
                <Campo
                  nome={`produzido-${i.id}`}
                  titulo={`${i.produtos.nome} · ${i.produtos.unidade} · produção total efetiva`}
                  inicial={i.quantidade_produzida}
                />
                <Button type="submit">Registrar quantidade produzida</Button>
              </fieldset>
            </form>
          ))}
          <p>
            Ao concluir a última etapa ou a OP, os produtos efetivamente
            produzidos entram no local da fábrica. Consumos pendentes impedem a
            confirmação.
          </p>
          <Button
            disabled={bloqueado || !podeConcluir}
            onClick={() =>
              enviar(`/api/ordem_producao/${ordem.id}/concluir`, {})
            }
          >
            Concluir OP e registrar entrada na fábrica
          </Button>
        </>
      )}
    </div>
  )
}

function FecharPedido({
  pedido,
  requisitar,
  revisao,
  bloqueado,
  enviar,
}: {
  pedido: Pedido
  requisitar: Api
  revisao: number
  bloqueado: boolean
  enviar: Enviar
}) {
  const [categoria, setCategoria] = useState("")
  const consulta = useConsulta<{ id: number; nome: string }[]>(
    pedido.pedido_cliente_fechamento.length
      ? null
      : `/api/pedidos/${pedido.id}/opcoes-fechamento`,
    requisitar,
    revisao,
  )
  if (pedido.pedido_cliente_fechamento.length)
    return (
      <p>
        Fechamento registrado.{" "}
        <Link className="underline" href="/financeiro/contas-receber">
          Consultar parcelas e registrar recebimentos
        </Link>
      </p>
    )
  return (
    <Caixa titulo="Fechamento e geração de parcelas">
      <p>
        O recebimento físico está confirmado. Fechar gera os títulos a receber e
        mantém o estoque já movimentado na entrega.
      </p>
      {consulta.erro && <p role="alert">{consulta.erro}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          void enviar(
            `/api/pedidos/${pedido.id}/fechar`,
            {
              idCategoriaFinanceira: Number(categoria),
              vencimentos: String(fd.get("vencimentos-fechamento"))
                .split(/\s+/)
                .filter(Boolean),
            },
            "POST",
            { "If-Match": `"${pedido.versao}"` },
          )
        }}
      >
        <fieldset disabled={bloqueado} className="space-y-3">
          <Seletor
            titulo="Categoria da receita"
            valor={categoria}
            alterar={setCategoria}
            opcoes={(consulta.dados ?? []).map((c) => ({
              value: String(c.id),
              label: c.nome,
            }))}
          />
          <Field>
            <FieldLabel htmlFor="vencimentos-fechamento">
              Vencimentos acordados, um por linha (AAAA-MM-DD)
            </FieldLabel>
            <Textarea
              id="vencimentos-fechamento"
              name="vencimentos-fechamento"
              placeholder="2026-12-10"
              required
            />
          </Field>
          <Button type="submit" disabled={!categoria}>
            Confirmar fechamento e gerar parcelas
          </Button>
        </fieldset>
      </form>
    </Caixa>
  )
}

function Transferencias({
  requisitar,
  revisao,
  opcoes,
  bloqueado,
  enviar,
}: {
  requisitar: Api
  revisao: number
  opcoes: Opcoes
  bloqueado: boolean
  enviar: Enviar
}) {
  const [produto, setProduto] = useState("")
  const [variacao, setVariacao] = useState("")
  const [origem, setOrigem] = useState("")
  const [destino, setDestino] = useState("")
  const [setor, setSetor] = useState("")
  const [pagina, setPagina] = useState(1)
  const item = opcoes.produtos.find((p) => p.id === Number(produto))
  const posicao = item?.estoque.find(
    (p) => p.id_local_estoque === Number(origem),
  )
  const consulta = useConsulta<{
    dados: {
      id: number
      id_produto: number
      id_variacao: number | null
      id_local_origem: number
      id_local_destino: number
      quantidade: string
      status: string
    }[]
    totalPaginas: number
  }>(
    `/api/estoque/transferencias?pagina=${pagina}&limite=25`,
    requisitar,
    revisao,
  )
  return (
    <Caixa titulo="Transferência física entre fábrica e loja">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          void enviar("/api/estoque/transferencias/enviar", {
            idProduto: Number(produto),
            ...(variacao ? { idVariacao: Number(variacao) } : {}),
            idLocalOrigem: Number(origem),
            idSetorOrigem: posicao?.id_setor,
            idLocalDestino: Number(destino),
            idSetorDestino: Number(setor),
            quantidade: String(fd.get("transferir-quantidade")).replace(
              ",",
              ".",
            ),
            observacao: fd.get("transferir-observacao"),
          })
        }}
      >
        <fieldset disabled={bloqueado} className="grid gap-3 sm:grid-cols-2">
          <Seletor
            titulo="Produto"
            valor={produto}
            alterar={(v) => {
              setProduto(v)
              setOrigem("")
              setVariacao("")
            }}
            opcoes={opcoes.produtos.map((p) => ({
              value: String(p.id),
              label: `${p.nome} · ${p.unidade}`,
            }))}
          />
          {item?.produto_variacoes.length ? (
            <Seletor
              titulo="Variação"
              valor={variacao}
              alterar={setVariacao}
              opcoes={item.produto_variacoes.map((v) => ({
                value: String(v.id),
                label: grade(v),
              }))}
            />
          ) : null}
          <Seletor
            titulo="Local de origem"
            valor={origem}
            alterar={setOrigem}
            opcoes={(item?.estoque ?? []).map((p) => ({
              value: String(p.id_local_estoque),
              label:
                opcoes.locais.find((l) => l.id === p.id_local_estoque)?.nome ??
                String(p.id_local_estoque),
            }))}
          />
          <Seletor
            titulo="Local de destino"
            valor={destino}
            alterar={setDestino}
            opcoes={opcoes.locais.map((p) => ({
              value: String(p.id),
              label: p.nome,
            }))}
          />
          <Seletor
            titulo="Setor de destino"
            valor={setor}
            alterar={setSetor}
            opcoes={opcoes.setores.map((p) => ({
              value: String(p.id),
              label: p.nome,
            }))}
          />
          <Campo nome="transferir-quantidade" titulo="Quantidade enviada" />
          <Campo nome="transferir-observacao" titulo="Motivo do envio" />
          <p>
            A saída ocorre no envio. O destino recebe saldo somente após a
            confirmação física abaixo.
          </p>
          <Button type="submit" disabled={!posicao || !destino || !setor}>
            Confirmar envio físico
          </Button>
        </fieldset>
      </form>
      {consulta.erro && <p role="alert">{consulta.erro}</p>}
      {consulta.dados && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto / transferência</TableHead>
                <TableHead>Origem → destino</TableHead>
                <TableHead>Quantidade / situação</TableHead>
                <TableHead>Confirmação física</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {consulta.dados.dados.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    {opcoes.produtos.find((p) => p.id === r.id_produto)?.nome ??
                      `Produto ${r.id_produto}`}{" "}
                    · #{r.id}
                  </TableCell>
                  <TableCell>
                    {
                      opcoes.locais.find((l) => l.id === r.id_local_origem)
                        ?.nome
                    }{" "}
                    →{" "}
                    {
                      opcoes.locais.find((l) => l.id === r.id_local_destino)
                        ?.nome
                    }
                  </TableCell>
                  <TableCell>
                    {formatarQuantidade(r.quantidade)} · {r.status}
                  </TableCell>
                  <TableCell>
                    {r.status === "ENVIADA" && (
                      <Button
                        disabled={bloqueado}
                        onClick={() =>
                          enviar(
                            `/api/estoque/transferencias/${r.id}/receber`,
                            {},
                          )
                        }
                      >
                        Confirmar recebimento no destino
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </Button>
            <span>Página {pagina}</span>
            <Button
              variant="outline"
              disabled={pagina >= consulta.dados.totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
    </Caixa>
  )
}

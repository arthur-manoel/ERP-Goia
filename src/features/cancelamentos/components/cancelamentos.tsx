"use client"
import Link from "next/link"
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PageHeader } from "@/components/layout/page-header"
import {
  formatarDataHora,
  formatarData,
  formatarMoeda,
  formatarQuantidade,
} from "@/lib/formatacao"
import type {
  DetalheCancelamento as Detalhe,
  ListaCancelamentos as Lista,
  PreviaCancelamento as Previa,
} from "../types"
const nomes: Record<string, string> = {
  PEDIDO: "Cancelar pedido",
  ENTREGA: "Estornar entrega ou remessa",
  FECHAMENTO: "Estornar fechamento",
  AGUARDANDO_APROVACAO: "Aguardando aprovação gerencial",
  AGUARDANDO_EXECUCAO: "Aguardando execução",
  REJEITADA: "Solicitação rejeitada",
  EXECUTADA_PENDENCIAS: "Executado com pendências",
  CONCLUIDA: "Concluído",
  INTERVENCAO: "Revisão necessária",
}
const data = (v: string | null) => (v ? formatarDataHora(new Date(v)) : "—")
function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      {titulo}
      {children}
    </label>
  )
}
function Selecionar({
  name,
  titulo,
  itens,
  padrao,
  required = true,
}: {
  name: string
  titulo: string
  itens: { id: number; nome: string }[]
  padrao?: number
  required?: boolean
}) {
  return (
    <Campo titulo={titulo}>
      <select
        name={name}
        defaultValue={padrao ? String(padrao) : ""}
        required={required}
        className="h-9 rounded-md border bg-background px-2"
      >
        <option value="">Selecione</option>
        {itens.map((i) => (
          <option key={i.id} value={i.id}>
            {i.nome}
          </option>
        ))}
      </select>
    </Campo>
  )
}
type Pendente = { url: string; body: unknown; chave: string }
type Enviar = (url: string, body: unknown) => Promise<boolean>
export function Cancelamentos({
  pedidoInicial,
  cancelamentoInicial,
}: {
  pedidoInicial?: number
  cancelamentoInicial?: number
}) {
  const { estado, usuario, empresa, empresas, selecionarEmpresa } =
    useAutenticacao()
  return (
    <>
      <PageHeader
        titulo="Cancelamentos e estornos"
        descricao="Solicite, acompanhe decisões e conclua devoluções e restituições da empresa ativa."
      />
      {empresas.length > 1 && (
        <Campo titulo="Empresa ativa">
          <select
            value={empresa?.id ?? ""}
            onChange={(e) => selecionarEmpresa(Number(e.target.value))}
          >
            <option value="">Selecione</option>
            {empresas.map((e) => (
              <option value={e.id} key={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </Campo>
      )}
      {estado !== "autenticado" || !empresa ? (
        <p>Entre na sua conta e selecione uma empresa.</p>
      ) : (
        <Conteudo
          key={`${usuario?.email}:${empresa.id}`}
          identidade={`${usuario?.email}:${empresa.id}`}
          pedidoInicial={pedidoInicial}
          cancelamentoInicial={cancelamentoInicial}
        />
      )}
    </>
  )
}
function Conteudo({
  identidade,
  pedidoInicial,
  cancelamentoInicial,
}: {
  identidade: string
  pedidoInicial?: number
  cancelamentoInicial?: number
}) {
  const { requisitar } = useAutenticacao()
  const [lista, setLista] = useState<Lista>()
  const [detalhe, setDetalhe] = useState<Detalhe>()
  const [previa, setPrevia] = useState<Previa>()
  const [erro, setErro] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const trava = useRef(false)
  const travaConsulta = useRef(false)
  const leituraDetalhe = useRef(0)
  const [consultando, setConsultando] = useState(Boolean(pedidoInicial))
  const [pendente, setPendente] = useState<Pendente>()
  const storage = `erp-cancelamento:${identidade}`
  const [pagina, setPagina] = useState(1)
  const [pedido, setPedido] = useState(
    pedidoInicial ? String(pedidoInicial) : "",
  )
  const [pedidoCarregado, setPedidoCarregado] = useState<number | undefined>(
    pedidoInicial,
  )
  const [entregas, setEntregas] = useState<
    { id: number; numero_entrega: number; status: string }[]
  >([])
  const [tipo, setTipo] = useState("PEDIDO")
  const [idEntrega, setIdEntrega] = useState("")
  const [motivo, setMotivo] = useState("")
  const [cargos, setCargos] =
    useState<{ id: number; nome: string; aprova_cancelamento: boolean }[]>()
  const [confirmar, setConfirmar] = useState(false)
  const consultar = useCallback(
    async <T,>(url: string) => {
      const r = await requisitar(url, { cache: "no-store" })
      const v = await r.json()
      if (!r.ok) throw new Error(v.error ?? "Não foi possível consultar.")
      return v.data as T
    },
    [requisitar],
  )
  const carregar = useCallback(async () => {
    setLista(
      await consultar<Lista>(`/api/cancelamentos?pagina=${pagina}&limite=25`),
    )
  }, [consultar, pagina])
  useEffect(() => {
    let ativa = true
    void consultar<Lista>(`/api/cancelamentos?pagina=${pagina}&limite=25`).then(
      (v) => {
        if (ativa) setLista(v)
      },
      (e) => {
        if (ativa) setErro(String(e.message))
      },
    )
    return () => {
      ativa = false
    }
  }, [consultar, pagina])
  useEffect(() => {
    let ativa = true
    void Promise.resolve().then(() => {
      const salvo = sessionStorage.getItem(storage)
      if (salvo && ativa) {
        try {
          const p = JSON.parse(salvo) as Pendente
          if (
            typeof p.url === "string" &&
            p.url.startsWith("/api/") &&
            typeof p.chave === "string"
          )
            setPendente(p)
        } catch {}
      }
    })
    return () => {
      ativa = false
    }
  }, [storage])
  useEffect(() => {
    let ativa = true
    if (cancelamentoInicial)
      void consultar<Detalhe>(`/api/cancelamentos/${cancelamentoInicial}`).then(
        (v) => {
          if (ativa) setDetalhe(v)
        },
        (e) => {
          if (ativa) setErro(e.message)
        },
      )
    return () => {
      ativa = false
    }
  }, [consultar, cancelamentoInicial])
  const atualizarPedido = useCallback(
    async (id: number) => {
      const v = await consultar<{
        pedido: { pedido_cliente_entrega: typeof entregas } | null
      }>(`/api/pedidos/${id}/cancelamentos`)
      if (!v.pedido) throw new Error("Pedido não encontrado nesta empresa.")
      setEntregas(v.pedido.pedido_cliente_entrega)
      setPedidoCarregado(id)
    },
    [consultar],
  )
  useEffect(() => {
    let ativa = true
    if (pedidoInicial)
      void consultar<{
        pedido: { pedido_cliente_entrega: typeof entregas } | null
      }>(`/api/pedidos/${pedidoInicial}/cancelamentos`).then(
        (v) => {
          if (ativa && v.pedido) {
            setEntregas(v.pedido.pedido_cliente_entrega)
            setPedidoCarregado(pedidoInicial)
          }
          if (ativa) setConsultando(false)
        },
        (e) => {
          if (ativa) {
            setErro(e.message)
            setConsultando(false)
          }
        },
      )
    return () => {
      ativa = false
    }
  }, [consultar, pedidoInicial])
  async function abrir(id: number) {
    try {
      setErro("")
      const leitura = ++leituraDetalhe.current
      const dados = await consultar<Detalhe>(`/api/cancelamentos/${id}`)
      if (leitura !== leituraDetalhe.current) return
      setDetalhe(dados)
      setConfirmar(false)
    } catch (e) {
      setErro((e as Error).message)
    }
  }
  async function enviar(url: string, body: unknown) {
    if (trava.current) return false
    const tentativa = pendente ?? { url, body, chave: crypto.randomUUID() }
    try {
      sessionStorage.setItem(storage, JSON.stringify(tentativa))
    } catch {
      setErro(
        "Habilite o armazenamento da sessão para preservar esta tentativa.",
      )
      return false
    }
    trava.current = true
    setOcupado(true)
    setPendente(tentativa)
    setErro("")
    try {
      const r = await requisitar(tentativa.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": tentativa.chave,
        },
        body: JSON.stringify(tentativa.body),
      })
      const v = await r.json()
      if (!r.ok) {
        if ([400, 403, 404, 409, 413, 415, 422].includes(r.status)) {
          sessionStorage.removeItem(storage)
          setPendente(undefined)
        }
        if (r.status === 409) {
          try {
            await carregar()
            if (detalhe)
              setDetalhe(
                await consultar<Detalhe>(`/api/cancelamentos/${detalhe.id}`),
              )
          } catch {}
        }
        throw new Error(
          v.error ?? "Não foi possível confirmar. Repita a mesma tentativa.",
        )
      }
      sessionStorage.removeItem(storage)
      setPendente(undefined)
      toast.success("Etapa registrada.")
      await carregar()
      if (detalhe)
        setDetalhe(await consultar<Detalhe>(`/api/cancelamentos/${detalhe.id}`))
      if (tentativa.url.endsWith("/cancelamentos") && v.data.id)
        await abrir(v.data.id)
      if (v.notificacoes?.entregaPendente)
        toast.message(
          "Etapa confirmada. A entrega das notificações será repetida.",
        )
      return true
    } catch (e) {
      setErro((e as Error).message)
      return false
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }
  async function consultaProtegida<T>(operacao: () => Promise<T>) {
    if (travaConsulta.current || trava.current) return
    travaConsulta.current = true
    setConsultando(true)
    setErro("")
    try {
      return await operacao()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      travaConsulta.current = false
      setConsultando(false)
    }
  }
  async function verPrevia() {
    if (!pedidoCarregado) return
    return consultaProtegida(async () => {
      const p = await consultar<Previa>(
        `/api/pedidos/${pedidoCarregado}/cancelamentos/previa?tipo=${tipo}${tipo === "ENTREGA" ? `&idEntrega=${idEntrega}` : ""}`,
      )
      setPrevia(p)
      return p
    })
  }
  async function reavaliar(d: Detalhe, motivo: string) {
    await consultaProtegida(async () => {
      const p = await consultar<Previa>(
        `/api/pedidos/${d.idPedido}/cancelamentos/previa?tipo=${d.tipo}${d.tipo === "ENTREGA" ? `&idEntrega=${d.idEntrega}` : ""}`,
      )
      await enviar(`/api/cancelamentos/${d.id}/reavaliar`, {
        hashEstado: p.hashEstado,
        motivo,
      })
    })
  }
  const bloqueado = ocupado || consultando || Boolean(pendente)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <Link className="underline" href="/vendas/pedidos">
          Pedidos e entregas
        </Link>
        <Link className="underline" href="/notificacoes">
          Notificações internas
        </Link>
        <Button
          variant="outline"
          disabled={ocupado}
          onClick={() => void carregar().catch((e) => setErro(e.message))}
        >
          Atualizar consultas
        </Button>
      </div>
      {erro && (
        <p
          role="alert"
          className="rounded-md border border-destructive p-3 text-destructive"
        >
          {erro}
        </p>
      )}
      {pendente && (
        <div role="status" className="rounded-md border p-3">
          {ocupado
            ? "Registrando a etapa. Aguarde a confirmação."
            : "Uma tentativa ficou sem resposta conclusiva. Os dados foram preservados."}{" "}
          <Button
            disabled={ocupado}
            onClick={() => void enviar(pendente.url, pendente.body)}
          >
            Repetir a mesma tentativa
          </Button>
        </div>
      )}
      {lista?.permissoes.solicitar && (
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="text-lg font-semibold">Nova solicitação</h2>
          <form
            className="flex items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (bloqueado) return
              setPrevia(undefined)
              void consultaProtegida(() => atualizarPedido(Number(pedido)))
            }}
          >
            <Campo titulo="Identificador do pedido">
              <Input
                type="number"
                min={1}
                required
                value={pedido}
                onChange={(e) => {
                  setPedido(e.target.value)
                  setPrevia(undefined)
                  setPedidoCarregado(undefined)
                }}
                disabled={bloqueado}
              />
            </Campo>
            <Button type="submit" disabled={bloqueado}>
              Consultar pedido
            </Button>
          </form>
          {pedidoCarregado && (
            <>
              <Campo titulo="Operação">
                <select
                  className="h-9 rounded-md border bg-background px-2"
                  disabled={bloqueado}
                  value={tipo}
                  onChange={(e) => {
                    setTipo(e.target.value)
                    setPrevia(undefined)
                  }}
                >
                  {["PEDIDO", "ENTREGA", "FECHAMENTO"].map((t) => (
                    <option key={t} value={t}>
                      {nomes[t]}
                    </option>
                  ))}
                </select>
              </Campo>
              {tipo === "ENTREGA" && (
                <Campo titulo="Entrega ou remessa">
                  <select
                    className="h-9 rounded-md border bg-background px-2"
                    disabled={bloqueado}
                    value={idEntrega}
                    onChange={(e) => {
                      setIdEntrega(e.target.value)
                      setPrevia(undefined)
                    }}
                  >
                    <option value="">Selecione</option>
                    {entregas
                      .filter((e) => e.status !== "CANCELADA")
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          Entrega {e.numero_entrega} — {e.status}
                        </option>
                      ))}
                  </select>
                </Campo>
              )}
              <Button
                variant="outline"
                disabled={bloqueado || (tipo === "ENTREGA" && !idEntrega)}
                onClick={() => void verPrevia()}
              >
                Consultar efeitos e prazo
              </Button>
              {previa && (
                <>
                  <ResumoPrevia previa={previa} />
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (!bloqueado)
                        void enviar(
                          `/api/pedidos/${pedidoCarregado}/cancelamentos`,
                          {
                            tipo,
                            ...(tipo === "ENTREGA"
                              ? { idEntrega: Number(idEntrega) }
                              : {}),
                            motivo,
                            hashEstado: previa.hashEstado,
                          },
                        )
                    }}
                  >
                    <Campo titulo="Motivo da solicitação">
                      <Textarea
                        required
                        minLength={5}
                        maxLength={255}
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        disabled={bloqueado}
                      />
                    </Campo>
                    <Button type="submit" disabled={bloqueado}>
                      Registrar solicitação
                    </Button>
                  </form>
                </>
              )}
            </>
          )}
        </section>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Solicitações da empresa</h2>
        {lista?.itens.map((i) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            key={i.id}
          >
            <div>
              <strong>
                #{i.id} · Pedido {i.numeroPedido}
              </strong>
              <p>
                {nomes[i.tipo]} · {nomes[i.status] ?? i.status}
              </p>
              <p className="text-sm text-muted-foreground">{i.motivo}</p>
            </div>
            <Button
              variant="outline"
              disabled={ocupado}
              onClick={() => void abrir(i.id)}
            >
              Acompanhar solicitação {i.id}
            </Button>
          </div>
        ))}
        {lista?.total === 0 && <p>Nenhuma solicitação encontrada.</p>}
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={pagina === 1 || ocupado}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </Button>
          <span>Página {pagina}</span>
          <Button
            variant="outline"
            disabled={!lista || pagina * 25 >= lista.total || ocupado}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </section>
      {detalhe && (
        <section key={detalhe.id} className="space-y-5 rounded-lg border p-4">
          <h2 className="text-xl font-semibold">
            Solicitação #{detalhe.id} · Pedido {detalhe.numeroPedido}
          </h2>
          <p>
            {nomes[detalhe.tipo]} · <strong>{nomes[detalhe.status]}</strong>
          </p>
          <p>{detalhe.motivo}</p>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              Solicitante: {detalhe.solicitante} · {data(detalhe.solicitadoEm)}
            </div>
            <div>Fechamento de referência: {data(detalhe.fechadoEm)}</div>
            <div>
              Limite sem aprovação adicional: {data(detalhe.limiteSemAprovacao)}
            </div>
            <div>Execução: {data(detalhe.executadoEm)}</div>
            <div>
              Decisão: {detalhe.decisao ?? "Ainda não registrada"} ·{" "}
              {detalhe.decisor ?? "—"}
            </div>
            <div>Conclusão: {data(detalhe.concluidoEm)}</div>
          </dl>
          {detalhe.referenciaInconsistente && (
            <p role="alert">
              A origem precisa de regularização. A aprovação gerencial, sozinha,
              não libera a execução.
            </p>
          )}
          <EfeitosPersistidos plano={detalhe.plano} />
          {detalhe.motivoDecisao && (
            <p>Motivo da decisão: {detalhe.motivoDecisao}</p>
          )}
          {detalhe.ultimaFalha && <p role="alert">{detalhe.ultimaFalha}</p>}
          {typeof detalhe.plano.credito === "string" && (
            <p>Compensação prevista: {formatarMoeda(detalhe.plano.credito)}</p>
          )}
          <p>
            Reservas ainda ativas serão liberadas sem entrada física. A produção
            concluída, compras e consumos permanecem no histórico. Documentos
            fiscais externos devem seguir o processo fiscal responsável.
          </p>
          {!detalhe.executadoEm &&
            !["REJEITADA", "CONCLUIDA"].includes(detalhe.status) && (
              <>
                {(detalhe.permissoes.solicitar ||
                  detalhe.permissoes.gerente) && (
                  <form
                    className="space-y-2"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (bloqueado) return
                      const f = new FormData(e.currentTarget)
                      await reavaliar(detalhe, String(f.get("motivo")))
                    }}
                  >
                    <Campo titulo="Motivo da reavaliação">
                      <Input
                        name="motivo"
                        minLength={5}
                        maxLength={255}
                        required
                        disabled={bloqueado}
                      />
                    </Campo>
                    <Button
                      type="submit"
                      disabled={bloqueado}
                      variant="outline"
                    >
                      Atualizar efeitos e invalidar decisão anterior
                    </Button>
                  </form>
                )}
                {detalhe.permissoes.gerente && (
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (bloqueado) return
                      const f = new FormData(e.currentTarget)
                      void enviar(`/api/cancelamentos/${detalhe.id}/decisao`, {
                        decisao: f.get("decisao"),
                        motivo: f.get("motivo"),
                      })
                    }}
                  >
                    <fieldset disabled={bloqueado} className="space-y-2">
                      <Campo titulo="Decisão gerencial">
                        <select
                          name="decisao"
                          className="h-9 rounded-md border bg-background px-2"
                        >
                          <option value="REJEITADA">Rejeitar</option>
                          {detalhe.status === "AGUARDANDO_APROVACAO" && (
                            <option value="APROVADA">Aprovar</option>
                          )}
                        </select>
                      </Campo>
                      <Campo titulo="Justificativa da decisão">
                        <Textarea
                          name="motivo"
                          minLength={5}
                          maxLength={255}
                          required
                        />
                      </Campo>
                      <Button type="submit">Registrar decisão</Button>
                    </fieldset>
                  </form>
                )}
                {detalhe.permissoes.solicitar &&
                  detalhe.status === "AGUARDANDO_EXECUCAO" && (
                    <div className="space-y-3">
                      <label className="flex gap-2">
                        <input
                          type="checkbox"
                          checked={confirmar}
                          disabled={bloqueado}
                          onChange={(e) => setConfirmar(e.target.checked)}
                        />
                        Conferi os efeitos e autorizo a execução interna.
                        Devoluções e reembolsos serão confirmados nas etapas
                        seguintes.
                      </label>
                      <Button
                        variant="destructive"
                        disabled={bloqueado || !confirmar}
                        onClick={() =>
                          void enviar(
                            `/api/cancelamentos/${detalhe.id}/executar`,
                            {},
                          )
                        }
                      >
                        Executar cancelamento ou estorno
                      </Button>
                    </div>
                  )}
              </>
            )}
          {detalhe.devolucoes.map((l) => (
            <div key={l.id} className="space-y-3 rounded-md border p-3">
              <h3 className="font-semibold">
                Retorno · {l.produto}
                {l.idVariacao ? ` · Variação ${l.idVariacao}` : ""} · Saída #
                {l.idMovimentoOriginal}
              </h3>
              <p>
                Previsto: {formatarQuantidade(l.prevista)} {l.unidade} ·
                Recebido: {formatarQuantidade(l.recebida)} {l.unidade}
              </p>
              {detalhe.status === "EXECUTADA_PENDENCIAS" &&
                detalhe.permissoes.editarEstoque &&
                l.prevista !== l.recebida && (
                  <FormularioRetorno
                    key={`r:${l.id}`}
                    detalhe={detalhe}
                    linha={l}
                    bloqueado={bloqueado}
                    enviar={enviar}
                  />
                )}{" "}
              {l.recebimentos.map((r) => (
                <div key={r.id} className="space-y-2 border-t pt-2">
                  <p>
                    Recebimento #{r.id}: {formatarQuantidade(r.quantidade)}{" "}
                    {l.unidade} · {r.condicao} · Responsável #{r.idResponsavel}{" "}
                    · {data(r.recebidoEm)}
                  </p>
                  <p>
                    {r.observacao} · Destinado:{" "}
                    {formatarQuantidade(r.destinada)} {l.unidade}
                  </p>
                  {r.destinacoes.map((d) => (
                    <p key={d.id}>
                      Destino: {d.tratamento} · Entrada #
                      {d.id_movimento_entrada}
                      {d.id_movimento_saida
                        ? ` · Baixa #${d.id_movimento_saida}`
                        : ""}{" "}
                      · {d.motivo}
                    </p>
                  ))}
                  {r.condicao === "AVARIADA" &&
                    r.quantidade !== r.destinada &&
                    detalhe.permissoes.editarEstoque &&
                    detalhe.permissoes.gerente && (
                      <FormularioAvaria
                        detalhe={detalhe}
                        idRecebimento={r.id}
                        bloqueado={bloqueado}
                        enviar={enviar}
                      />
                    )}
                </div>
              ))}
            </div>
          ))}
          {detalhe.permissoes.financeiro && (
            <div className="space-y-3">
              <h3 className="font-semibold">Compensações e restituições</h3>
              {detalhe.creditos.length === 0 && (
                <p>Nenhuma compensação financeira registrada.</p>
              )}
              {detalhe.creditos.map((c) => (
                <div key={c.id} className="space-y-3 rounded-md border p-3">
                  <p>
                    Título #{c.idTitulo} · Crédito: {formatarMoeda(c.valor)} ·
                    Cobrança anulada: {formatarMoeda(c.saldoAnulado)}
                  </p>
                  <p>
                    Restituição prevista: {formatarMoeda(c.restituir)} ·
                    Realizada: {formatarMoeda(c.reembolsado)}
                  </p>
                  {c.reembolsos.map((r) => (
                    <p key={r.id}>
                      Restituição #{r.id}: {formatarMoeda(r.valor)} ·{" "}
                      {formatarData(new Date(r.data))} · Responsável #
                      {r.idResponsavel} · Extrato #{r.idMovimentos.join(", ")}
                    </p>
                  ))}
                  {detalhe.permissoes.editarFinanceiro &&
                    c.restituir !== c.reembolsado &&
                    detalhe.status === "EXECUTADA_PENDENCIAS" && (
                      <FormularioReembolso
                        detalhe={detalhe}
                        idCredito={c.id}
                        bloqueado={bloqueado}
                        enviar={enviar}
                      />
                    )}
                </div>
              ))}
            </div>
          )}
          <div>
            <h3 className="font-semibold">Histórico</h3>
            {detalhe.historico.map((h) => (
              <p key={h.id} className="text-sm">
                {data(h.data_evento)} ·{" "}
                {h.acao === "INSERT"
                  ? "Solicitação registrada"
                  : "Etapa atualizada"}{" "}
                · Responsável #{h.id_usuario}
              </p>
            ))}
          </div>
        </section>
      )}
      {lista?.permissoes.administrador && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">Autorização gerencial por cargo</h2>
          <p>
            Os cargos começam sem autorização adicional. Proprietários e
            administradores já podem decidir; os demais precisam também de
            leitura em pedidos.
          </p>
          <Button
            disabled={bloqueado}
            variant="outline"
            onClick={() =>
              void consultar<typeof cargos>("/api/cancelamentos/cargos")
                .then(setCargos)
                .catch((e) => setErro(e.message))
            }
          >
            Consultar cargos
          </Button>
          {cargos?.map((c) => (
            <label key={c.id} className="flex gap-2">
              <input
                type="checkbox"
                checked={c.aprova_cancelamento}
                disabled={bloqueado}
                onChange={(e) => {
                  const valor = e.target.checked
                  void enviar(`/api/cancelamentos/cargos/${c.id}`, {
                    aprovaCancelamento: valor,
                  }).then((ok) => {
                    if (ok)
                      setCargos((cs) =>
                        cs?.map((x) =>
                          x.id === c.id
                            ? { ...x, aprova_cancelamento: valor }
                            : x,
                        ),
                      )
                  })
                }}
              />
              {c.nome}: pode aprovar cancelamentos
            </label>
          ))}
        </section>
      )}
    </div>
  )
}
function ResumoPrevia({ previa: p }: { previa: Previa }) {
  return (
    <div className="space-y-2 rounded-md bg-muted p-3">
      <p>
        Fechamento: {data(p.fechadoEm)} · Limite: {data(p.limiteSemAprovacao)} (
        {p.fuso})
      </p>
      <p>
        {p.exigeAprovacao
          ? "Exige análise e aprovação gerencial."
          : "Sem aprovação adicional pelo prazo. As permissões das etapas continuam obrigatórias."}
      </p>
      <p>
        {p.reservas.length} reservas a liberar · {p.entregas.length} entregas a
        anular · {p.devolucoes.length} saídas com retorno a confirmar
      </p>
      {p.credito !== null && (
        <p>
          Crédito proporcional completo, incluindo frete:{" "}
          {formatarMoeda(p.credito)}
        </p>
      )}
      {p.inconsistencias.map((v, i) => (
        <p key={i} role="alert">
          {v}
        </p>
      ))}
      <p>A solicitação não executa efeitos.</p>
    </div>
  )
}
function submeter(
  e: FormEvent<HTMLFormElement>,
  callback: (f: FormData) => void,
) {
  e.preventDefault()
  callback(new FormData(e.currentTarget))
}
function FormularioRetorno({
  detalhe: d,
  linha: l,
  bloqueado,
  enviar,
}: {
  detalhe: Detalhe
  linha: Detalhe["devolucoes"][number]
  bloqueado: boolean
  enviar: Enviar
}) {
  const [condicao, setCondicao] = useState("APROVEITAVEL")
  return (
    <form
      onSubmit={(e) =>
        submeter(e, (f) => {
          if (!bloqueado)
            void enviar(`/api/cancelamentos/${d.id}/devolucoes`, {
              idLinha: l.id,
              quantidade: f.get("quantidade"),
              condicao,
              observacao: f.get("observacao"),
              ...(condicao === "APROVEITAVEL"
                ? {
                    idLocalEstoque: Number(f.get("local")),
                    idSetor: Number(f.get("setor")),
                  }
                : {}),
            })
        })
      }
    >
      <fieldset disabled={bloqueado} className="grid gap-3 sm:grid-cols-2">
        <Campo titulo="Quantidade efetivamente recebida">
          <Input
            name="quantidade"
            inputMode="decimal"
            required
            pattern="[0-9]+(\.[0-9]{1,3})?"
            placeholder="Ex.: 1.500"
          />
        </Campo>
        <Campo titulo="Condição do retorno">
          <select
            value={condicao}
            onChange={(e) => setCondicao(e.target.value)}
            className="h-9 rounded-md border bg-background px-2"
          >
            <option value="APROVEITAVEL">Aprovado para estoque</option>
            <option value="AVARIADA">Avariado — aguardar inspeção</option>
          </select>
        </Campo>
        {condicao === "APROVEITAVEL" && (
          <>
            <Selecionar
              name="local"
              titulo="Local de recebimento"
              itens={d.opcoes.locais}
              padrao={l.idLocalOrigem ?? undefined}
            />
            <Selecionar
              name="setor"
              titulo="Setor de recebimento"
              itens={d.opcoes.setores}
              padrao={l.idSetorOrigem ?? undefined}
            />
          </>
        )}
        <Campo titulo="Observação do recebimento">
          <Textarea name="observacao" required minLength={5} maxLength={255} />
        </Campo>
        <Button type="submit">Confirmar retorno físico</Button>
      </fieldset>
    </form>
  )
}
function FormularioAvaria({
  detalhe: d,
  idRecebimento,
  bloqueado,
  enviar,
}: {
  detalhe: Detalhe
  idRecebimento: number
  bloqueado: boolean
  enviar: Enviar
}) {
  return (
    <form
      onSubmit={(e) =>
        submeter(e, (f) => {
          if (!bloqueado)
            void enviar(`/api/cancelamentos/${d.id}/destinacoes`, {
              idRecebimento,
              quantidade: f.get("quantidade"),
              tratamento: f.get("tratamento"),
              motivo: f.get("motivo"),
              idLocalEstoque: Number(f.get("local")),
              idSetor: Number(f.get("setor")),
            })
        })
      }
    >
      <fieldset disabled={bloqueado} className="grid gap-3 sm:grid-cols-2">
        <Campo titulo="Quantidade inspecionada">
          <Input name="quantidade" required inputMode="decimal" />
        </Campo>
        <Campo titulo="Destino da avaria">
          <select
            name="tratamento"
            className="h-9 rounded-md border bg-background px-2"
          >
            <option value="ESTOQUE">Liberar após inspeção</option>
            <option value="DESCARTE">
              Descartar com entrada e baixa vinculadas
            </option>
          </select>
        </Campo>
        <Selecionar
          name="local"
          titulo="Local da destinação"
          itens={d.opcoes.locais}
        />
        <Selecionar
          name="setor"
          titulo="Setor da destinação"
          itens={d.opcoes.setores}
        />
        <Campo titulo="Motivo da destinação">
          <Textarea name="motivo" required minLength={5} maxLength={255} />
        </Campo>
        <Button type="submit">Registrar destinação da avaria</Button>
      </fieldset>
    </form>
  )
}
function FormularioReembolso({
  detalhe: d,
  idCredito,
  bloqueado,
  enviar,
}: {
  detalhe: Detalhe
  idCredito: number
  bloqueado: boolean
  enviar: Enviar
}) {
  return (
    <form
      onSubmit={(e) =>
        submeter(e, (f) => {
          if (!bloqueado)
            void enviar(`/api/cancelamentos/${d.id}/reembolsos`, {
              idCredito,
              valor: f.get("valor"),
              data: f.get("data"),
              idContaBancaria: Number(f.get("conta")),
              referencia: f.get("referencia") || null,
              observacao: f.get("observacao") || null,
            })
        })
      }
    >
      <fieldset disabled={bloqueado} className="grid gap-3 sm:grid-cols-2">
        <Campo titulo="Valor efetivamente restituído">
          <Input
            name="valor"
            required
            inputMode="decimal"
            placeholder="Ex.: 10.50"
          />
        </Campo>
        <Campo titulo="Data da restituição">
          <Input name="data" type="date" required />
        </Campo>
        <Selecionar
          name="conta"
          titulo="Conta de saída"
          itens={d.opcoes.contas}
        />
        <Campo titulo="Referência">
          <Input name="referencia" maxLength={100} />
        </Campo>
        <Campo titulo="Observação financeira">
          <Textarea name="observacao" maxLength={255} />
        </Campo>
        <p className="text-sm">
          Registre somente a restituição já realizada. Esta ação registra a
          saída no extrato e não envia dinheiro pelo banco.
        </p>
        <Button type="submit">Registrar restituição realizada</Button>
      </fieldset>
    </form>
  )
}

function EfeitosPersistidos({ plano }: { plano: Detalhe["plano"] }) {
  const array = (campo: string) => {
    const v = plano[campo]
    return Array.isArray(v) ? v : []
  }
  return (
    <div className="space-y-2 rounded-md bg-muted p-3">
      <h3 className="font-semibold">Efeitos previstos na solicitação</h3>
      <p>
        {array("reservas").length} reservas a liberar ·{" "}
        {array("entregas").length} entregas a anular ·{" "}
        {array("devolucoes").length} saídas com retorno a confirmar
      </p>
      {array("devolucoes").map((v, i) =>
        v && typeof v === "object" && !Array.isArray(v) ? (
          <p key={i}>
            Produto #{String(v.idProduto)} · {String(v.quantidade)}{" "}
            {String(v.unidade)} · Saída #{String(v.idMovimento)} · Retorno
            físico ainda precisa ser confirmado.
          </p>
        ) : null,
      )}
    </div>
  )
}

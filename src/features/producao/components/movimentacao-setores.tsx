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
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { lerRespostaOperacao } from "@/features/erp/resposta-operacao"
import { milesimos, formatarMilesimos } from "@/features/reservas/quantidades"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageHeader } from "@/components/layout/page-header"

type Etapa = { id: number; id_setor: number; nome: string; status: string }
type Posicao = {
  idItem: number
  idCor: number | null
  idTamanho: number | null
  produto: string
  unidade: string
  etapas: {
    idEtapa: number
    entrada: string
    produzida: string
    perdida: string
    aProduzir: string
    enviada: string
    recebidaDestino: string
    emTransito: string
    disponivelEnvio: string
    noSetor: string
  }[]
}
type Movimento = {
  id: number
  id_setor_origem: number | null
  id_setor_destino: number
  id_usuario_envio: number
  data_envio: string
  status: string
  ordem_producao_movimentacao_item: {
    id_ordem_producao_item: number
    quantidade: string
  }[]
}
type Item = Omit<Posicao, "etapas">
type Lotes = {
  itens: Item[]
  resumoLegado: {
    idItem: number
    etapas: {
      idEtapa: number
      disponivel: string
      produzida: string
      perdida: string
      restante: string
    }[]
  }[]
  numero: string
  status: string
  protocoloQuantitativo: boolean
  pendencia: string
  etapas: Etapa[]
  posicoes: Posicao[]
  movimentos: Movimento[]
  recebimentos: {
    id: number
    id_movimentacao: number
    id_usuario: number
    data_recebimento: string
    id_item: number
    quantidade: string
  }[]
  total: number
}
type Ponto = {
  id: number
  id_ordem_producao_item: number
  id_setor: number
  quantidade_produzida: string
  quantidade_perdida: string
  data_apontamento: string
  valido: boolean
}
type Tentativa = { url: string; body: unknown; chave: string }
const rotulo = (p: Item) =>
  `${p.produto} · item ${p.idItem} · cor ${p.idCor ?? "—"} / tamanho ${p.idTamanho ?? "—"} (${p.unidade})`
async function json<T>(r: Response): Promise<T> {
  const v = await r.json()
  if (!r.ok) throw new Error(v.error ?? "Falha na consulta.")
  return v.data ?? v
}
const hoje = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())

export function MovimentacaoSetores({
  ordemInicial = "",
}: {
  ordemInicial?: string
}) {
  const { estado, empresa, empresas, usuario, selecionarEmpresa } =
    useAutenticacao()
  return (
    <>
      <PageHeader
        titulo="Apontamentos e movimentação entre setores"
        descricao="Registre a produção, envie parcelas e confirme o recebimento por item."
      />
      {empresas.length > 1 && (
        <label className="grid gap-2 text-sm">
          Empresa ativa
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            aria-label="Empresa ativa"
            value={empresa?.id ?? ""}
            onChange={(e) => selecionarEmpresa(Number(e.target.value))}
          >
            <option value="" disabled>
              Selecione uma empresa
            </option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      {estado === "autenticado" && empresa ? (
        <Conteudo
          key={`${usuario?.email}:${empresa.id}`}
          identidade={`${usuario?.email}:${empresa.id}`}
          ordemInicial={ordemInicial}
        />
      ) : (
        <p>Entre na sua conta e selecione uma empresa.</p>
      )}
    </>
  )
}
function Conteudo({
  identidade,
  ordemInicial,
}: {
  identidade: string
  ordemInicial: string
}) {
  const { requisitar } = useAutenticacao()
  const [ordens, setOrdens] = useState<
    { id: number; numero: string; status: string }[]
  >([])
  const [busca, setBusca] = useState(""),
    [paginaOrdens, setPaginaOrdens] = useState(1)
  const [ordem, setOrdem] = useState(ordemInicial)
  const [pagina, setPagina] = useState(1),
    [revisao, setRevisao] = useState(0),
    [carregado, setCarregado] = useState<{
      consulta: string
      dados: Lotes
    } | null>(null)
  const [historico, setHistorico] = useState<{
      consulta: string
      rows: Ponto[]
    } | null>(null),
    [paginaPontos, setPaginaPontos] = useState(1),
    [totalPontos, setTotalPontos] = useState(0)
  const [erro, setErro] = useState(""),
    [sucesso, setSucesso] = useState(""),
    [ocupado, setOcupado] = useState(false)
  const [origem, setOrigem] = useState(""),
    [edicao, setEdicao] = useState<Ponto | null>(null)
  const trava = useRef(false),
    vivo = useRef(true),
    storage = `erp-lote-setor:${identidade}`
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])
  const registro = useSyncExternalStore(
    useCallback((fn: () => void) => {
      window.addEventListener("storage", fn)
      return () => window.removeEventListener("storage", fn)
    }, []),
    useCallback(() => sessionStorage.getItem(storage), [storage]),
    () => null,
  )
  const pendente = useMemo<Tentativa | null>(() => {
    try {
      const v = registro ? JSON.parse(registro) : null
      return v &&
        typeof v.chave === "string" &&
        /^\/api\/(ordens-producao|ordem_producao)\/\d+\//.test(v.url)
        ? v
        : null
    } catch {
      return null
    }
  }, [registro])
  const consulta = `${ordem}:${pagina}:${paginaPontos}:${revisao}`
  const dados = carregado?.consulta === consulta ? carregado.dados : null
  const pontos = historico?.consulta === consulta ? historico.rows : []

  useEffect(() => {
    const c = new AbortController()
    requisitar(
      `/api/ordem_producao?limit=20&page=${paginaOrdens}&numero=${encodeURIComponent(busca)}`,
      { signal: c.signal },
    )
      .then(json<{ rows: { id: number; numero: string; status: string }[] }>)
      .then((v) => {
        if (!c.signal.aborted) setOrdens(v.rows)
      })
      .catch((e) => {
        if (!c.signal.aborted) setErro(e.message)
      })
    return () => c.abort()
  }, [requisitar, busca, paginaOrdens, revisao])
  useEffect(() => {
    if (!ordem) return
    const c = new AbortController()
    requisitar(`/api/ordens-producao/${ordem}/movimentacoes?pagina=${pagina}`, {
      signal: c.signal,
    })
      .then(json<Lotes>)
      .then((v) => {
        if (!c.signal.aborted) setCarregado({ consulta, dados: v })
      })
      .catch((e) => {
        if (!c.signal.aborted) setErro(e.message)
      })
    requisitar(
      `/api/ordens-producao/${ordem}/apontamentos?page=${paginaPontos}&limit=20`,
      { signal: c.signal },
    )
      .then(json<{ rows: Ponto[]; count: number }>)
      .then((v) => {
        if (!c.signal.aborted) {
          setHistorico({ consulta, rows: v.rows })
          setTotalPontos(v.count)
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setErro(e.message)
      })
    return () => c.abort()
  }, [ordem, pagina, paginaPontos, requisitar, revisao, consulta])
  function limpar() {
    sessionStorage.removeItem(storage)
    window.dispatchEvent(new Event("storage"))
  }
  async function enviar(url: string, body: unknown, retomar = false) {
    if (trava.current || (!retomar && pendente)) return
    const tentativa = retomar
      ? pendente!
      : { url, body, chave: crypto.randomUUID() }
    try {
      sessionStorage.setItem(storage, JSON.stringify(tentativa))
    } catch {
      setErro("Habilite o armazenamento da sessão antes de confirmar.")
      return
    }
    trava.current = true
    setOcupado(true)
    window.dispatchEvent(new Event("storage"))
    setErro("")
    setSucesso("")
    try {
      const r = await requisitar(tentativa.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": tentativa.chave,
        },
        body: JSON.stringify(tentativa.body),
      })
      const v = await lerRespostaOperacao(r, limpar)
      if (!r.ok)
        throw new Error(
          v.error ?? "Resposta inconclusiva. Repita a mesma tentativa.",
        )
      limpar()
      if (vivo.current) {
        setSucesso("Operação confirmada e persistida.")
        setEdicao(null)
        setOrigem("")
        setRevisao((n) => n + 1)
      }
    } catch (e) {
      if (vivo.current)
        setErro(e instanceof Error ? e.message : "Falha na confirmação.")
    } finally {
      trava.current = false
      if (vivo.current) setOcupado(false)
    }
  }
  const bloqueado = ocupado || !!pendente
  function quantidades(f: FormData) {
    return dados!.itens
      .filter((p) => String(f.get(`q-${p.idItem}`) ?? "").trim() !== "")
      .map((p) => ({
        idItem: p.idItem,
        quantidade: String(f.get(`q-${p.idItem}`)).replace(",", "."),
      }))
  }
  function movimento(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget),
      index = dados!.etapas.findIndex((t) => String(t.id) === origem)
    void enviar(`/api/ordens-producao/${ordem}/movimentacoes`, {
      idEtapaOrigem: Number(origem),
      idEtapaDestino: dados!.etapas[index + 1]?.id,
      itens: quantidades(f),
      ...(f.get("observacao")
        ? { observacao: String(f.get("observacao")) }
        : {}),
    })
  }
  function apontar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const body = {
      quantidadeProduzida: String(f.get("boa")).replace(",", "."),
      quantidadePerdida: String(f.get("perda")).replace(",", "."),
      motivoPerda: f.get("motivo") || null,
      dataApontamento: String(f.get("data")),
    }
    void enviar(
      edicao
        ? `/api/ordens-producao/${ordem}/apontamentos/${edicao.id}/corrigir`
        : `/api/ordens-producao/${ordem}/apontamentos`,
      edicao
        ? { ...body, motivoCorrecao: String(f.get("correcao")) }
        : {
            ...body,
            idItem: Number(f.get("item")),
            idEtapa: Number(f.get("etapa")),
          },
    )
  }
  return (
    <div className="space-y-6">
      <Link
        className="underline"
        href={`/producao/ordens${ordem ? `?ordem=${ordem}` : ""}`}
      >
        Ordens, reservas e consumo real de materiais
      </Link>
      <p>
        Confirme o consumo de materiais na tela de ordens. O transporte entre
        setores não dá baixa de insumos nem entrada de produto acabado.
      </p>
      {erro && <p role="alert">{erro}</p>}
      {sucesso && <p role="status">{sucesso}</p>}
      {pendente && (
        <div role="alert">
          Existe uma tentativa sem confirmação.{" "}
          <Button
            disabled={ocupado}
            onClick={() => void enviar(pendente.url, pendente.body, true)}
          >
            Recuperar mesma tentativa
          </Button>
        </div>
      )}
      <label className="grid gap-2 text-sm">
        Buscar número
        <Input
          aria-label="Buscar número"
          maxLength={50}
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setPaginaOrdens(1)
          }}
        />
      </label>
      <label className="grid gap-2 text-sm">
        Ordem de produção
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="Ordem de produção"
          value={ordem}
          disabled={bloqueado}
          onChange={(e) => {
            setOrdem(e.target.value)
            setEdicao(null)
            setOrigem("")
            setPagina(1)
            setPaginaPontos(1)
            setErro("")
          }}
        >
          <option value="">Selecione</option>
          {ordem && !ordens.some((o) => String(o.id) === ordem) && (
            <option value={ordem}>OP {ordem}</option>
          )}
          {ordens.map((o) => (
            <option key={o.id} value={o.id}>
              {o.numero} · {o.status}
            </option>
          ))}
        </select>
      </label>
      <div>
        <Button
          disabled={paginaOrdens === 1}
          onClick={() => setPaginaOrdens((n) => n - 1)}
        >
          Ordens anteriores
        </Button>
        <Button
          disabled={ordens.length < 20}
          onClick={() => setPaginaOrdens((n) => n + 1)}
        >
          Próximas ordens
        </Button>
      </div>
      {dados && (
        <>
          <h2 className="text-lg font-semibold">
            Ordem {dados.numero} · {dados.status}
          </h2>
          <p>
            {dados.protocoloQuantitativo
              ? "Fracionamento ativo. O cabeçalho resume a primeira etapa não concluída; as posições reais estão abaixo."
              : "O primeiro envio ativa o fracionamento. Ordens já avançadas pelo fluxo antigo preservam o protocolo anterior."}
          </p>
          {dados.pendencia && <p role="alert">{dados.pendencia}</p>}
          {dados.resumoLegado.length > 0 && (
            <section className="space-y-4 rounded-lg border p-4">
              <h2 className="text-lg font-semibold">
                Disponibilidade no protocolo anterior
              </h2>
              <p>
                O fluxo anterior comprova a disponibilidade pela produção boa da
                etapa anterior. Estas quantidades não representam recebimentos
                fracionados.
              </p>
              {dados.resumoLegado.map((p) => (
                <div key={p.idItem}>
                  <h3 className="font-medium">
                    {rotulo(dados.itens.find((i) => i.idItem === p.idItem)!)}
                  </h3>
                  {p.etapas.map((e) => (
                    <p key={e.idEtapa}>
                      {dados.etapas.find((t) => t.id === e.idEtapa)?.nome}:
                      disponibilidade comprovada {e.disponivel}; boas{" "}
                      {e.produzida}; perdas {e.perdida}; restante {e.restante}
                    </p>
                  ))}
                </div>
              ))}
            </section>
          )}
          <section className="space-y-4 rounded-lg border p-4">
            <h2 className="text-lg font-semibold">
              Posições por item e unidade
            </h2>
            {dados.posicoes.map((p) => (
              <div key={p.idItem} className="overflow-x-auto">
                <h3 className="font-medium">{rotulo(p)}</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {[
                        "Etapa",
                        "Entrada recebida",
                        "Boas",
                        "Perdas",
                        "A produzir",
                        "Enviadas",
                        "Recebidas no destino",
                        "Em trânsito",
                        "Disponível para envio",
                        "Permanece no setor",
                      ].map((t) => (
                        <th
                          className="border-b px-3 py-2 text-left whitespace-nowrap"
                          key={t}
                        >
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {p.etapas.map((t) => (
                      <tr key={t.idEtapa}>
                        {[
                          dados.etapas.find((e) => e.id === t.idEtapa)?.nome,
                          t.entrada,
                          t.produzida,
                          t.perdida,
                          t.aProduzir,
                          t.enviada,
                          t.recebidaDestino,
                          t.emTransito,
                          t.disponivelEnvio,
                          t.noSetor,
                        ].map((v, i) => (
                          <td
                            className="border-b px-3 py-2 whitespace-nowrap"
                            key={i}
                          >
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
          <section className="space-y-4 rounded-lg border p-4">
            <h2 className="text-lg font-semibold">
              Apontamento de produção {edicao ? `· corrigir #${edicao.id}` : ""}
            </h2>
            <form
              key={`${ordem}:${edicao?.id ?? "novo"}:${revisao}`}
              onSubmit={apontar}
              className="space-y-3"
            >
              <fieldset
                disabled={
                  bloqueado ||
                  !["EM_PRODUCAO", "PAUSADA", "CONCLUIDA"].includes(
                    dados.status,
                  )
                }
              >
                <label className="grid gap-2 text-sm">
                  Item
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    name="item"
                    aria-label="Item apontado"
                    required
                    disabled={!!edicao}
                    defaultValue={edicao?.id_ordem_producao_item}
                  >
                    {dados.itens.map((p) => (
                      <option key={p.idItem} value={p.idItem}>
                        {rotulo(p)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Etapa
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    name="etapa"
                    aria-label="Etapa apontada"
                    required
                    disabled={!!edicao}
                    defaultValue={
                      edicao
                        ? dados.etapas.find(
                            (e) => e.id_setor === edicao.id_setor,
                          )?.id
                        : undefined
                    }
                  >
                    {dados.etapas
                      .filter(
                        (e) =>
                          e.status === "EM_PRODUCAO" ||
                          e.status === "CONCLUIDA",
                      )
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nome}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  Quantidade boa
                  <Input
                    name="boa"
                    aria-label="Quantidade boa"
                    required
                    type="number"
                    min="0"
                    step="0.001"
                    defaultValue={edicao?.quantidade_produzida ?? "0"}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Quantidade perdida
                  <Input
                    name="perda"
                    aria-label="Quantidade perdida"
                    required
                    type="number"
                    min="0"
                    step="0.001"
                    defaultValue={edicao?.quantidade_perdida ?? "0"}
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  Motivo da perda
                  <Input name="motivo" maxLength={255} />
                </label>
                <label className="grid gap-2 text-sm">
                  Data
                  <Input
                    name="data"
                    required
                    type="date"
                    defaultValue={edicao?.data_apontamento ?? hoje()}
                  />
                </label>
                {edicao && (
                  <label className="grid gap-2 text-sm">
                    Motivo da correção
                    <Input name="correcao" required maxLength={255} />
                  </label>
                )}
                <Button type="submit">
                  {edicao ? "Corrigir apontamento" : "Registrar apontamento"}
                </Button>
              </fieldset>
            </form>
            {edicao && (
              <Button onClick={() => setEdicao(null)}>
                Voltar ao novo apontamento
              </Button>
            )}
          </section>
          <section className="space-y-4 rounded-lg border p-4">
            <h2 className="text-lg font-semibold">Enviar parcela</h2>
            <form onSubmit={movimento} className="space-y-3">
              <fieldset disabled={bloqueado || dados.status !== "EM_PRODUCAO"}>
                <label className="grid gap-2 text-sm">
                  Etapa de origem
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    aria-label="Etapa de origem"
                    required
                    value={origem}
                    onChange={(e) => setOrigem(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {dados.etapas
                      .slice(0, -1)
                      .filter((e) => e.status === "EM_PRODUCAO")
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nome}
                        </option>
                      ))}
                  </select>
                </label>
                <p>
                  Destino:{" "}
                  {origem
                    ? dados.etapas[
                        dados.etapas.findIndex((e) => String(e.id) === origem) +
                          1
                      ]?.nome
                    : "Selecione a origem"}
                </p>
                {dados.itens.map((p) => (
                  <label key={p.idItem}>
                    {rotulo(p)}
                    <Input
                      aria-label={`Enviar item ${p.idItem}`}
                      name={`q-${p.idItem}`}
                      type="number"
                      min="0.001"
                      step="0.001"
                    />
                  </label>
                ))}
                <label className="grid gap-2 text-sm">
                  Observação
                  <Input name="observacao" maxLength={255} />
                </label>
                <Button type="submit">Confirmar envio</Button>
              </fieldset>
            </form>
          </section>
          <section className="space-y-4 rounded-lg border p-4">
            <h2 className="text-lg font-semibold">Envios e recebimentos</h2>
            {dados.movimentos.map((m) => (
              <article key={m.id} className="my-4 border p-3">
                <h3 className="font-medium">
                  Envio #{m.id} · {m.status}
                </h3>
                <p>
                  {dados.etapas.find((e) => e.id_setor === m.id_setor_origem)
                    ?.nome ?? "Início da ordem"}{" "}
                  →{" "}
                  {
                    dados.etapas.find((e) => e.id_setor === m.id_setor_destino)
                      ?.nome
                  }{" "}
                  · responsável #{m.id_usuario_envio} ·{" "}
                  {new Date(m.data_envio).toLocaleString("pt-BR")}
                </p>
                {m.ordem_producao_movimentacao_item.length === 0 ? (
                  <p>Passagem legada sem quantidades por item.</p>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      void enviar(
                        `/api/ordens-producao/${ordem}/movimentacoes/${m.id}/receber`,
                        { itens: quantidades(new FormData(e.currentTarget)) },
                      )
                    }}
                  >
                    <fieldset
                      className="grid gap-3"
                      disabled={
                        bloqueado ||
                        m.status !== "EM_TRANSITO" ||
                        dados.status !== "EM_PRODUCAO"
                      }
                    >
                      {m.ordem_producao_movimentacao_item.map((l) => {
                        const p = dados.itens.find(
                          (p) => p.idItem === l.id_ordem_producao_item,
                        )
                        const recebida = dados.recebimentos
                          .filter(
                            (r) =>
                              r.id_movimentacao === m.id &&
                              r.id_item === l.id_ordem_producao_item,
                          )
                          .reduce(
                            (s, r) => s + milesimos(r.quantidade),
                            BigInt(0),
                          )
                        return (
                          <label key={l.id_ordem_producao_item}>
                            {p ? rotulo(p) : `Item ${l.id_ordem_producao_item}`}{" "}
                            · enviada {l.quantidade} · recebida{" "}
                            {formatarMilesimos(recebida)} · pendente{" "}
                            {formatarMilesimos(
                              milesimos(l.quantidade) - recebida,
                            )}
                            <Input
                              name={`q-${l.id_ordem_producao_item}`}
                              aria-label={`Receber envio ${m.id} item ${l.id_ordem_producao_item}`}
                              type="number"
                              min="0.001"
                              step="0.001"
                            />
                          </label>
                        )
                      })}
                      <Button type="submit">Confirmar recebimento</Button>
                    </fieldset>
                  </form>
                )}
                {dados.recebimentos
                  .filter((r) => r.id_movimentacao === m.id)
                  .map((r) => (
                    <p key={`${r.id}:${r.id_item}`}>
                      Recebimento #{r.id} · item {r.id_item} · {r.quantidade} ·
                      responsável #{r.id_usuario} ·{" "}
                      {new Date(r.data_recebimento).toLocaleString("pt-BR")}
                    </p>
                  ))}
              </article>
            ))}
            <Button
              disabled={pagina === 1}
              onClick={() => setPagina((n) => n - 1)}
            >
              Envios anteriores
            </Button>
            <span> Página {pagina} </span>
            <Button
              disabled={pagina * 20 >= dados.total}
              onClick={() => setPagina((n) => n + 1)}
            >
              Próximos envios
            </Button>
          </section>
          <section className="space-y-4 rounded-lg border p-4">
            <h2 className="text-lg font-semibold">Histórico de apontamentos</h2>
            {pontos.map((p) => (
              <div key={p.id}>
                {`#${p.id} · item ${p.id_ordem_producao_item} · setor ${p.id_setor} · ${p.quantidade_produzida} boas / ${p.quantidade_perdida} perdidas · ${p.data_apontamento} · ${p.valido ? "válido" : "substituído"}`}{" "}
                {p.valido && (
                  <>
                    <Button disabled={bloqueado} onClick={() => setEdicao(p)}>
                      Corrigir #{p.id}
                    </Button>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        void enviar(
                          `/api/ordens-producao/${ordem}/apontamentos/${p.id}/estornar`,
                          {
                            motivo: String(
                              new FormData(e.currentTarget).get("motivo"),
                            ),
                          },
                        )
                      }}
                    >
                      <Input
                        name="motivo"
                        placeholder="Motivo do estorno"
                        required
                        maxLength={255}
                      />
                      <Button disabled={bloqueado} type="submit">
                        Estornar #{p.id}
                      </Button>
                    </form>
                  </>
                )}
              </div>
            ))}
            <Button
              disabled={paginaPontos === 1}
              onClick={() => setPaginaPontos((n) => n - 1)}
            >
              Apontamentos anteriores
            </Button>
            <Button
              disabled={paginaPontos * 20 >= totalPontos}
              onClick={() => setPaginaPontos((n) => n + 1)}
            >
              Próximos apontamentos
            </Button>
          </section>
          <section className="space-y-4 rounded-lg border p-4">
            <h2 className="text-lg font-semibold">Etapas e encerramento</h2>
            <p>
              Conclua após apontar toda a entrada e receber as peças boas no
              destino. Encerre também o consumo e as reservas.
            </p>
            {dados.etapas.map((e) => (
              <div key={e.id}>
                {e.nome} · {e.status}{" "}
                <Button
                  disabled={bloqueado || e.status === "CONCLUIDA"}
                  onClick={() =>
                    void enviar(
                      `/api/ordem_producao/${ordem}/etapas/${e.id}/${e.status === "PENDENTE" ? "iniciar" : "concluir"}`,
                      {},
                    )
                  }
                >
                  {e.status === "PENDENTE" ? "Iniciar" : "Concluir"} {e.nome}
                </Button>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import {
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import {
  lerPedido,
  type OpcoesPedidos,
  type PedidoApi,
} from "@/features/pedidos/api"

type Item = {
  idProduto: number | null
  idVariacao: number | null
  produto: string
  codigo: string
  variacao: string
  quantidade: number
  unitario: number
}
type Venda = {
  id: number
  idEmpresa: number
  numero: string
  idCliente: number | null
  idPedido: number | null
  cliente: string | null
  pedido: string
  data: string
  status: "Concluída" | "Em aberto" | "Cancelada"
  items: Item[]
  desconto: number
  frete: number
}
type VendaApi = Omit<
  Venda,
  "data" | "status" | "items" | "desconto" | "frete"
> & {
  data: string
  status:
    | "RASCUNHO"
    | "CONFIRMADA"
    | "SEPARACAO"
    | "FATURADA"
    | "ENVIADA"
    | "ENTREGUE"
    | "CANCELADA"
  desconto: number | string
  frete: number | string
  items: (Item & {
    total: string
    quantidade: number | string
    unitario: number | string
  })[]
}

function converterVenda(venda: VendaApi): Venda {
  return {
    ...venda,
    data: new Intl.DateTimeFormat("pt-BR").format(new Date(venda.data)),
    status:
      venda.status === "RASCUNHO"
        ? "Em aberto"
        : venda.status === "CANCELADA"
          ? "Cancelada"
          : "Concluída",
    desconto: Number(venda.desconto),
    frete: Number(venda.frete),
    items: venda.items.map((item) => ({
      ...item,
      quantidade: Number(item.quantidade),
      unitario: Number(item.unitario),
    })),
  }
}

const statusApi = (status: Venda["status"]) =>
  status === "Concluída"
    ? "CONFIRMADA"
    : status === "Cancelada"
      ? "CANCELADA"
      : "RASCUNHO"

const moeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    valor,
  )
const total = (venda: Pick<Venda, "items" | "desconto" | "frete">) =>
  venda.items.reduce(
    (soma, item) => soma + item.quantidade * item.unitario,
    0,
  ) -
  venda.desconto +
  venda.frete

const iniciais = (nome: string) =>
  nome
    .split(" ")
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase()

const opcoesVazias: OpcoesPedidos = { clientes: [], produtos: [] }

const statusEstilo: Record<Venda["status"], string> = {
  Concluída: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  "Em aberto": "bg-amber-50 text-amber-700 ring-amber-600/15",
  Cancelada: "bg-slate-100 text-slate-500 ring-slate-500/10",
}

export function TelaPdv() {
  const { empresa, requisitar } = useAutenticacao()
  return (
    <TelaPdvConteudo
      key={empresa?.id ?? "sem-empresa"}
      empresaId={empresa?.id ?? null}
      requisitar={requisitar}
    />
  )
}

function TelaPdvConteudo({
  empresaId,
  requisitar,
}: {
  empresaId: number | null
  requisitar: (url: string, init?: RequestInit) => Promise<Response>
}) {
  const [vendas, setVendas] = useState<Venda[]>([])
  const [busca, setBusca] = useState("")
  const [filtro, setFiltro] = useState("Todas")
  const [editando, setEditando] = useState<Venda | null>(null)
  const [formAberto, setFormAberto] = useState(false)
  const [cliente, setCliente] = useState("")
  const [buscaOpcoes, setBuscaOpcoes] = useState("")
  const [opcoes, setOpcoes] = useState<
    OpcoesPedidos & { idEmpresa: number | null }
  >({
    ...opcoesVazias,
    idEmpresa: null,
  })
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(false)
  const [erroOpcoes, setErroOpcoes] = useState("")
  const [revisaoOpcoes, setRevisaoOpcoes] = useState(0)
  const [idPedido, setIdPedido] = useState("")
  const [pedidos, setPedidos] = useState<PedidoApi[]>([])
  const [carregandoPedidos, setCarregandoPedidos] = useState(false)
  const [erroPedidos, setErroPedidos] = useState("")
  const [revisaoPedidos, setRevisaoPedidos] = useState(0)
  const [items, setItems] = useState<Item[]>([
    {
      idProduto: null,
      idVariacao: null,
      produto: "",
      codigo: "",
      variacao: "",
      quantidade: 1,
      unitario: 0,
    },
  ])
  const [desconto, setDesconto] = useState(0)
  const [frete, setFrete] = useState(0)
  const [erroApi, setErroApi] = useState("")
  const [salvando, setSalvando] = useState(false)
  const [acoesEmCurso, setAcoesEmCurso] = useState<number[]>([])

  useEffect(() => {
    if (!empresaId) return
    const controller = new AbortController()
    requisitar("/api/vendas", {
      signal: controller.signal,
      headers: { "X-Empresa-Id": String(empresaId) },
    })
      .then(lerPedido<{ dados: VendaApi[] }>)
      .then((resultado) => {
        if (!controller.signal.aborted)
          setVendas(resultado.dados.map(converterVenda))
      })
      .catch((erro: Error) => {
        if (!controller.signal.aborted) setErroApi(erro.message)
      })
    return () => controller.abort()
  }, [empresaId, requisitar])

  useEffect(() => {
    if (!formAberto || !empresaId) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setCarregandoOpcoes(true)
      requisitar(
        `/api/pedidos/opcoes?busca=${encodeURIComponent(buscaOpcoes)}`,
        {
          signal: controller.signal,
          headers: { "X-Empresa-Id": String(empresaId) },
        },
      )
        .then(lerPedido<OpcoesPedidos>)
        .then((resultado) => {
          if (controller.signal.aborted) return
          setOpcoes((anteriores) => {
            const base =
              anteriores.idEmpresa === empresaId ? anteriores : opcoesVazias
            return {
              idEmpresa: empresaId,
              clientes: [
                ...new Map(
                  [...base.clientes, ...resultado.clientes].map((item) => [
                    item.id,
                    item,
                  ]),
                ).values(),
              ],
              produtos: [
                ...new Map(
                  [...base.produtos, ...resultado.produtos].map((item) => [
                    item.id,
                    item,
                  ]),
                ).values(),
              ],
            }
          })
          setErroOpcoes("")
        })
        .catch((erro: Error) => {
          if (!controller.signal.aborted) setErroOpcoes(erro.message)
        })
        .finally(() => {
          if (!controller.signal.aborted) setCarregandoOpcoes(false)
        })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [buscaOpcoes, empresaId, formAberto, requisitar, revisaoOpcoes])

  useEffect(() => {
    if (!formAberto || !empresaId || !cliente) return
    const controller = new AbortController()
    async function carregarPedidos() {
      try {
        const query = new URLSearchParams({
          pagina: "1",
          limite: "100",
          idCliente: cliente,
        })
        const primeira = await requisitar(`/api/pedidos?${query}`, {
          signal: controller.signal,
          headers: { "X-Empresa-Id": String(empresaId) },
        }).then(
          lerPedido<{
            dados: PedidoApi[]
            paginacao: { totalPaginas: number }
          }>,
        )
        const todos = [...primeira.dados]
        for (
          let pagina = 2;
          pagina <= primeira.paginacao.totalPaginas;
          pagina += 1
        ) {
          const paginaQuery = new URLSearchParams({
            pagina: String(pagina),
            limite: "100",
            idCliente: cliente,
          })
          const resposta = await requisitar(`/api/pedidos?${paginaQuery}`, {
            signal: controller.signal,
            headers: { "X-Empresa-Id": String(empresaId) },
          }).then(
            lerPedido<{
              dados: PedidoApi[]
              paginacao: { totalPaginas: number }
            }>,
          )
          todos.push(...resposta.dados)
        }
        if (!controller.signal.aborted)
          setPedidos(todos.filter((item) => item.status !== "CANCELADO"))
      } catch (erro) {
        if (!controller.signal.aborted) {
          setPedidos([])
          setErroPedidos(
            erro instanceof Error
              ? erro.message
              : "Não foi possível carregar os pedidos.",
          )
        }
      } finally {
        if (!controller.signal.aborted) setCarregandoPedidos(false)
      }
    }
    void carregarPedidos()
    return () => controller.abort()
  }, [cliente, empresaId, formAberto, requisitar, revisaoPedidos])

  const opcoesAtuais = opcoes.idEmpresa === empresaId ? opcoes : opcoesVazias

  const filtradas = useMemo(
    () =>
      vendas.filter(
        (venda) =>
          venda.idEmpresa === empresaId &&
          (filtro === "Todas" || venda.status === filtro) &&
          `${venda.numero} ${venda.cliente ?? "Venda avulsa"} ${venda.pedido}`
            .toLowerCase()
            .includes(busca.toLowerCase()),
      ),
    [vendas, filtro, busca, empresaId],
  )

  function abrirFormulario(venda?: Venda) {
    setEditando(venda ?? null)
    setCliente(venda?.idCliente ? String(venda.idCliente) : "")
    setCarregandoOpcoes(Boolean(empresaId))
    setErroOpcoes("")
    setPedidos([])
    setCarregandoPedidos(Boolean(venda?.idCliente))
    setErroPedidos("")
    setBuscaOpcoes("")
    setIdPedido(venda?.idPedido ? String(venda.idPedido) : "")
    setItems(
      venda
        ? venda.items.map((item) => ({ ...item }))
        : [
            {
              idProduto: null,
              idVariacao: null,
              produto: "",
              codigo: "",
              variacao: "",
              quantidade: 1,
              unitario: 0,
            },
          ],
    )
    setDesconto(venda?.desconto ?? 0)
    setFrete(venda?.frete ?? 0)
    setFormAberto(true)
  }

  async function salvar() {
    const itensValidos = items
    if (
      !empresaId ||
      !todosItensValidos ||
      !clienteValido ||
      !pedidoValido ||
      desconto < 0 ||
      frete < 0
    )
      return
    const idCliente = cliente ? Number(cliente) : null
    const pedidoSelecionado = pedidos.find(
      (item) => item.idPedido === Number(idPedido),
    )
    const payload = {
      idCliente,
      idPedido: pedidoSelecionado?.idPedido ?? null,
      desconto,
      frete,
      itens: itensValidos.map((item) => ({
        idProduto: item.idProduto!,
        idVariacao: item.idVariacao,
        quantidade: item.quantidade,
        valorUnitario: item.unitario,
      })),
    }
    setSalvando(true)
    setErroApi("")
    try {
      const resposta = await requisitar(
        editando ? `/api/vendas/${editando.id}` : "/api/vendas",
        {
          method: editando ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Empresa-Id": String(empresaId),
          },
          body: JSON.stringify(payload),
        },
      ).then(lerPedido<VendaApi>)
      const salva = converterVenda(resposta)
      setVendas((atuais) =>
        editando
          ? atuais.map((venda) => (venda.id === salva.id ? salva : venda))
          : [salva, ...atuais],
      )
      setFormAberto(false)
    } catch (erro) {
      setErroApi(
        erro instanceof Error
          ? erro.message
          : "Não foi possível salvar a venda.",
      )
    } finally {
      setSalvando(false)
    }
  }

  const vendasDaEmpresa = vendas.filter(
    (venda) => venda.idEmpresa === empresaId,
  )
  const abertas = vendasDaEmpresa.filter(
    (venda) => venda.status === "Em aberto",
  ).length
  const totalMes = vendasDaEmpresa
    .filter((venda) => venda.status === "Concluída")
    .reduce((soma, venda) => soma + total(venda), 0)
  const itensComProduto = items.filter((item) => item.idProduto !== null)
  const chavesItens = itensComProduto.map(
    (item) => `${item.idProduto}:${item.idVariacao ?? "SEM_VARIACAO"}`,
  )
  const itensDuplicados = new Set(chavesItens).size !== chavesItens.length
  const todosItensValidos =
    items.length > 0 &&
    !itensDuplicados &&
    items.every(
      (item) =>
        item.idProduto !== null &&
        opcoesAtuais.produtos.some((produto) => {
          if (produto.id !== item.idProduto) return false
          return (
            !produto.temGrade ||
            produto.variacoes.length === 0 ||
            produto.variacoes.some(
              (variacao) => variacao.id === item.idVariacao,
            )
          )
        }) &&
        Number.isFinite(item.quantidade) &&
        item.quantidade > 0 &&
        Number.isFinite(item.unitario) &&
        item.unitario >= 0,
    )
  const clienteValido =
    cliente === "" ||
    opcoesAtuais.clientes.some((opcao) => String(opcao.id) === cliente)
  const pedidoValido =
    idPedido === "" ||
    pedidos.some(
      (item) =>
        item.idPedido === Number(idPedido) &&
        String(item.idCliente) === cliente,
    )

  async function alterarStatus(venda: Venda, status: Venda["status"]) {
    setAcoesEmCurso((atuais) => [...atuais, venda.id])
    setErroApi("")
    try {
      const atualizada = await requisitar(`/api/vendas/${venda.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Empresa-Id": String(empresaId),
        },
        body: JSON.stringify({ status: statusApi(status) }),
      }).then(lerPedido<VendaApi>)
      const convertida = converterVenda(atualizada)
      setVendas((atuais) =>
        atuais.map((item) => (item.id === venda.id ? convertida : item)),
      )
    } catch (erro) {
      setErroApi(
        erro instanceof Error
          ? erro.message
          : "Não foi possível alterar o status.",
      )
    } finally {
      setAcoesEmCurso((atuais) => atuais.filter((id) => id !== venda.id))
    }
  }

  async function excluir(venda: Venda) {
    if (!window.confirm(`Excluir a venda ${venda.numero}?`)) return
    setAcoesEmCurso((atuais) => [...atuais, venda.id])
    setErroApi("")
    try {
      await requisitar(`/api/vendas/${venda.id}`, {
        method: "DELETE",
        headers: { "X-Empresa-Id": String(empresaId) },
      }).then(lerPedido<{ sucesso: true }>)
      setVendas((atuais) => atuais.filter((item) => item.id !== venda.id))
    } catch (erro) {
      setErroApi(
        erro instanceof Error
          ? erro.message
          : "Não foi possível excluir a venda.",
      )
    } finally {
      setAcoesEmCurso((atuais) => atuais.filter((id) => id !== venda.id))
    }
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-2xl bg-[#173d35] px-6 py-7 text-white shadow-sm sm:px-8">
        <div className="absolute -top-24 -right-10 h-72 w-72 rounded-full border border-white/10" />
        <div className="absolute -top-16 -right-2 h-56 w-56 rounded-full border border-white/10" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.18em] text-emerald-200 uppercase">
              <ShoppingBag size={15} /> Ponto de venda
            </div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Vendas da loja
            </h2>
            <p className="mt-2 max-w-lg text-sm text-white/70">
              Registre vendas, vincule pedidos e acompanhe cada atendimento em
              um só lugar.
            </p>
          </div>
          <Button
            onClick={() => abrirFormulario()}
            className="h-11 gap-2 self-start bg-white text-[#173d35] hover:bg-emerald-50 sm:self-auto"
          >
            <Plus size={17} /> Nova venda
          </Button>
        </div>
        <div className="relative mt-7 grid grid-cols-1 gap-3 border-t border-white/15 pt-5 sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-white/10 p-2.5">
              <CircleDollarSign size={19} />
            </span>
            <div>
              <p className="text-xs text-white/65">Vendas concluídas</p>
              <p className="mt-0.5 text-lg font-semibold">{moeda(totalMes)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-white/10 p-2.5">
              <ClipboardList size={19} />
            </span>
            <div>
              <p className="text-xs text-white/65">Em aberto</p>
              <p className="mt-0.5 text-lg font-semibold">
                {abertas}{" "}
                <span className="text-sm font-normal text-white/65">
                  vendas
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-white/10 p-2.5">
              <BadgeCheck size={19} />
            </span>
            <div>
              <p className="text-xs text-white/65">Registros no período</p>
              <p className="mt-0.5 text-lg font-semibold">
                {vendasDaEmpresa.length}{" "}
                <span className="text-sm font-normal text-white/65">
                  vendas
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card shadow-sm">
        {erroApi && (
          <div
            role="alert"
            className="m-5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {erroApi}
          </div>
        )}
        <div className="flex flex-col gap-4 border-b border-border/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h3 className="font-semibold">Histórico de vendas</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Consulte e gerencie os registros do PDV.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search
                className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
                size={16}
              />
              <Input
                aria-label="Buscar venda"
                placeholder="Buscar venda ou cliente"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                className="h-10 w-full pl-9 sm:w-60"
              />
            </div>
            <div className="relative">
              <select
                aria-label="Filtrar situação"
                className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm sm:w-40"
                value={filtro}
                onChange={(event) => setFiltro(event.target.value)}
              >
                <option>Todas</option>
                <option>Concluída</option>
                <option>Em aberto</option>
                <option>Cancelada</option>
              </select>
              <ChevronDown
                className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
                size={15}
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="bg-muted/30 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <th className="px-6 py-3.5">Venda</th>
                <th className="px-4 py-3.5">Cliente</th>
                <th className="px-4 py-3.5">Pedido relacionado</th>
                <th className="px-4 py-3.5">Data</th>
                <th className="px-4 py-3.5 text-right">Total</th>
                <th className="px-4 py-3.5">Situação</th>
                <th className="px-5 py-3.5" aria-label="Ações" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtradas.map((venda) => (
                <tr
                  key={venda.id}
                  className="transition-colors hover:bg-muted/20"
                >
                  <td className="px-6 py-4">
                    <button
                      onClick={() => abrirFormulario(venda)}
                      className="font-semibold text-foreground hover:text-emerald-800"
                    >
                      {venda.numero}
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {venda.items.length}{" "}
                      {venda.items.length === 1 ? "item" : "itens"}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    {venda.cliente ? (
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-50 text-[11px] font-semibold text-emerald-800">
                          {iniciais(venda.cliente)}
                        </span>
                        <span className="font-medium">{venda.cliente}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        Venda avulsa
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    {venda.pedido === "—" ? (
                      <span className="text-muted-foreground/60">
                        Sem pedido
                      </span>
                    ) : (
                      <span className="font-medium text-foreground">
                        {venda.pedido}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <CalendarDays size={14} />
                      {venda.data}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-semibold tabular-nums">
                    {moeda(total(venda))}
                  </td>
                  <td className="px-4 py-4">
                    <select
                      aria-label={`Alterar situação de ${venda.numero}`}
                      value={venda.status}
                      disabled={acoesEmCurso.includes(venda.id)}
                      onChange={(event) =>
                        void alterarStatus(
                          venda,
                          event.target.value as Venda["status"],
                        )
                      }
                      className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 ${statusEstilo[venda.status]}`}
                    >
                      <option disabled={venda.status !== "Em aberto"}>
                        Em aberto
                      </option>
                      <option disabled={venda.status !== "Em aberto"}>
                        Concluída
                      </option>
                      <option disabled={venda.status === "Cancelada"}>
                        Cancelada
                      </option>
                    </select>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        aria-label={`Editar ${venda.numero}`}
                        onClick={() => abrirFormulario(venda)}
                        disabled={venda.status !== "Em aberto"}
                        title={
                          venda.status === "Em aberto"
                            ? "Editar rascunho"
                            : "Somente rascunhos podem ser editados"
                        }
                        className="rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                      >
                        Editar
                      </button>
                      <button
                        aria-label={`Excluir ${venda.numero}`}
                        onClick={() => void excluir(venda)}
                        disabled={
                          acoesEmCurso.includes(venda.id) ||
                          venda.status !== "Em aberto"
                        }
                        title={
                          venda.status === "Em aberto"
                            ? "Excluir rascunho"
                            : "Somente rascunhos podem ser excluídos"
                        }
                        className="rounded-md p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center">
                    <div className="mx-auto grid size-11 place-items-center rounded-full bg-muted">
                      <Search size={18} className="text-muted-foreground" />
                    </div>
                    <p className="mt-3 font-medium">Nenhuma venda encontrada</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ajuste a busca ou o filtro, ou registre uma nova venda.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border/70 px-6 py-3.5 text-xs text-muted-foreground">
          <span>
            Mostrando {filtradas.length} de {vendasDaEmpresa.length} vendas
          </span>
          <span>Valores em R$</span>
        </div>
      </section>

      {formAberto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setFormAberto(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
            className="max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-background shadow-2xl sm:max-w-2xl sm:rounded-2xl"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between border-b bg-background px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold tracking-widest text-emerald-800 uppercase">
                  Ponto de venda
                </p>
                <h3 id="form-title" className="mt-1 text-xl font-semibold">
                  {editando ? `Editar ${editando.numero}` : "Nova venda"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Informe o cliente e os produtos da venda.
                </p>
              </div>
              <button
                aria-label="Fechar"
                onClick={() => setFormAberto(false)}
                className="rounded-md p-2 text-muted-foreground hover:bg-muted"
              >
                <X size={18} />
              </button>
            </header>
            <div className="space-y-5 p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium">
                  Cliente{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                  <SearchSelect
                    label="Cliente"
                    value={cliente}
                    onValueChange={(valor) => {
                      setCliente(valor)
                      setIdPedido("")
                      setPedidos([])
                      setCarregandoPedidos(Boolean(valor))
                      setErroPedidos("")
                    }}
                    options={[
                      { value: "", label: "Venda avulsa (sem cliente)" },
                      ...opcoesAtuais.clientes.map((opcao) => ({
                        value: String(opcao.id),
                        label: opcao.nome_razao_social,
                      })),
                    ]}
                    placeholder="Buscar cliente da empresa..."
                    disabled={!empresaId || carregandoOpcoes}
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Pedido de venda{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional)
                  </span>
                  <SearchSelect
                    label="Pedido de venda"
                    value={idPedido}
                    onValueChange={(valor) => {
                      setIdPedido(valor)
                    }}
                    options={[
                      {
                        value: "",
                        label: cliente
                          ? "Venda avulsa (sem pedido)"
                          : "Selecione um cliente primeiro",
                      },
                      ...pedidos.map((item) => ({
                        value: String(item.idPedido),
                        label: `${item.numero} · ${item.status.replaceAll("_", " ")}`,
                      })),
                    ]}
                    placeholder={
                      cliente
                        ? "Buscar pedido do cliente..."
                        : "Selecione um cliente primeiro"
                    }
                    disabled={!cliente || carregandoPedidos}
                  />
                </label>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="busca-catalogo-pdv"
                  className="text-sm font-medium"
                >
                  Buscar cliente ou produto
                </label>
                <Input
                  id="busca-catalogo-pdv"
                  value={buscaOpcoes}
                  maxLength={100}
                  onChange={(event) => {
                    setCarregandoOpcoes(true)
                    setBuscaOpcoes(event.target.value)
                  }}
                  placeholder="Digite nome ou código para localizar cadastros"
                />
                <p className="text-xs text-muted-foreground">
                  As opções seguem a empresa ativa e mostram cadastros ativos.
                </p>
              </div>
              {erroOpcoes && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  <span>{erroOpcoes}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCarregandoOpcoes(true)
                      setErroOpcoes("")
                      setRevisaoOpcoes((valor) => valor + 1)
                    }}
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}
              {erroPedidos && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                >
                  <span>{erroPedidos}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCarregandoPedidos(true)
                      setErroPedidos("")
                      setRevisaoPedidos((valor) => valor + 1)
                    }}
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Itens da venda</h4>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((atuais) => [
                        ...atuais,
                        {
                          idProduto: null,
                          idVariacao: null,
                          produto: "",
                          codigo: "",
                          variacao: "",
                          quantidade: 1,
                          unitario: 0,
                        },
                      ])
                    }
                    className="flex items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950"
                  >
                    <Plus size={14} /> Adicionar item
                  </button>
                </div>
                <div className="space-y-2">
                  {items.map((item, index) => {
                    const produtoSelecionado = opcoesAtuais.produtos.find(
                      (produto) => produto.id === item.idProduto,
                    )
                    const opcoesVariacao = produtoSelecionado?.variacoes ?? []
                    return (
                      <div
                        key={index}
                        className="grid grid-cols-1 items-end gap-2 rounded-lg border border-border/70 p-3 sm:grid-cols-[minmax(0,1fr)_76px_112px_32px]"
                      >
                        <div
                          className={`grid min-w-0 gap-2 ${produtoSelecionado?.temGrade ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}
                        >
                          <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
                            Produto
                            <SearchSelect
                              label={`Produto do item ${index + 1}`}
                              value={
                                item.idProduto ? String(item.idProduto) : ""
                              }
                              onValueChange={(valor) => {
                                const escolhido = opcoesAtuais.produtos.find(
                                  (produto) => String(produto.id) === valor,
                                )
                                setItems((atuais) =>
                                  atuais.map((linha, pos) =>
                                    pos === index
                                      ? {
                                          ...linha,
                                          idProduto: escolhido?.id ?? null,
                                          idVariacao: null,
                                          variacao: "",
                                          produto: escolhido?.nome ?? "",
                                          codigo: escolhido?.codigo ?? "",
                                          unitario: escolhido
                                            ? Number(escolhido.preco)
                                            : 0,
                                        }
                                      : linha,
                                  ),
                                )
                              }}
                              options={opcoesAtuais.produtos.map((produto) => ({
                                value: String(produto.id),
                                label: `${produto.codigo} · ${produto.nome}`,
                              }))}
                              placeholder="Buscar produto da empresa..."
                              disabled={!empresaId || carregandoOpcoes}
                              className="h-9 text-sm text-foreground"
                            />
                          </label>
                          {produtoSelecionado?.temGrade && (
                            <label className="min-w-0 space-y-1 text-xs text-muted-foreground">
                              Variação
                              <SearchSelect
                                label={`Variação do item ${index + 1}`}
                                value={
                                  item.idVariacao ? String(item.idVariacao) : ""
                                }
                                onValueChange={(valor) => {
                                  const variacao = opcoesVariacao.find(
                                    (opcao) => String(opcao.id) === valor,
                                  )
                                  const nomeVariacao = variacao
                                    ? `${variacao.cor} · ${variacao.tamanho}`
                                    : ""
                                  setItems((atuais) =>
                                    atuais.map((linha, pos) =>
                                      pos === index
                                        ? {
                                            ...linha,
                                            idVariacao: variacao?.id ?? null,
                                            variacao: nomeVariacao,
                                          }
                                        : linha,
                                    ),
                                  )
                                }}
                                options={opcoesVariacao.map((variacao) => ({
                                  value: String(variacao.id),
                                  label: `${variacao.cor} · ${variacao.tamanho}`,
                                }))}
                                placeholder="Selecionar cor/tamanho..."
                                disabled={!opcoesVariacao.length}
                                className="h-9 text-sm text-foreground"
                              />
                            </label>
                          )}
                        </div>
                        <label className="space-y-1 text-xs text-muted-foreground">
                          Qtd.
                          <Input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={item.quantidade}
                            onChange={(event) =>
                              setItems((atuais) =>
                                atuais.map((linha, pos) =>
                                  pos === index
                                    ? {
                                        ...linha,
                                        quantidade: Number(event.target.value),
                                      }
                                    : linha,
                                ),
                              )
                            }
                            className="h-9 px-2 text-right text-sm text-foreground"
                          />
                        </label>
                        <label className="space-y-1 text-xs text-muted-foreground">
                          Valor un.
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={item.unitario}
                            onChange={(event) =>
                              setItems((atuais) =>
                                atuais.map((linha, pos) =>
                                  pos === index
                                    ? {
                                        ...linha,
                                        unitario: Number(event.target.value),
                                      }
                                    : linha,
                                ),
                              )
                            }
                            className="h-9 px-2 text-right text-sm text-foreground"
                          />
                        </label>
                        <button
                          type="button"
                          aria-label="Remover item"
                          disabled={items.length === 1}
                          onClick={() =>
                            setItems((atuais) =>
                              atuais.filter((_, pos) => pos !== index),
                            )
                          }
                          className="mb-1 rounded p-2 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    )
                  })}
                </div>
                {itensDuplicados && (
                  <p role="alert" className="mt-2 text-xs text-destructive">
                    Cada combinação de produto e variação deve aparecer uma
                    única vez na venda.
                  </p>
                )}
                {!opcoesAtuais.produtos.length &&
                  !carregandoOpcoes &&
                  !erroOpcoes && (
                    <p className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
                      Nenhum produto ativo e habilitado para venda foi
                      encontrado para esta empresa. Use a busca ou cadastre o
                      produto em Produtos.
                    </p>
                  )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium">
                  Desconto (R$)
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={desconto}
                    onChange={(event) =>
                      setDesconto(Number(event.target.value))
                    }
                    className="h-10"
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Frete (R$)
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={frete}
                    onChange={(event) => setFrete(Number(event.target.value))}
                    className="h-10"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[#173d35]/5 px-4 py-3">
                <span className="text-sm font-medium text-muted-foreground">
                  Total da venda
                </span>
                <span className="text-xl font-semibold text-[#173d35] tabular-nums">
                  {moeda(total({ items, desconto, frete }))}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                As setas dos valores monetários avançam R$ 1,00. A quantidade
                mantém três casas decimais, como no cadastro dos itens de venda.
              </p>
            </div>
            <footer className="flex justify-end gap-2 border-t bg-muted/20 px-5 py-4 sm:px-6">
              <Button variant="outline" onClick={() => setFormAberto(false)}>
                Cancelar
              </Button>
              <Button
                disabled={
                  salvando ||
                  !empresaId ||
                  carregandoOpcoes ||
                  !todosItensValidos ||
                  !clienteValido ||
                  !pedidoValido ||
                  desconto < 0 ||
                  frete < 0
                }
                onClick={salvar}
                className="bg-[#173d35] text-white hover:bg-[#23584c]"
              >
                {salvando
                  ? "Salvando..."
                  : editando
                    ? "Salvar alterações"
                    : "Registrar venda"}
              </Button>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}

"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { Field, FieldLabel } from "@/components/ui/field"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"
import { formatarMoeda } from "@/lib/formatacao"
import {
  lerPedido,
  itemPedidoInputSchema,
  podeDescartarTentativa,
  rascunhoPedidoSchema,
  statusPedidos,
  type PedidoApi,
  type ItemPedidoApi,
  type OpcoesPedidos,
} from "../api"

type Linha = {
  idProduto: string
  idVariacao: string
  quantidade: string
  precoPraticado: string
}
const novaLinha = (): Linha => ({
  idProduto: "",
  idVariacao: "",
  quantidade: "1",
  precoPraticado: "0.00",
})
const prepararItem = (i: Linha) => ({
  idProduto: Number(i.idProduto),
  idVariacao: i.idVariacao ? Number(i.idVariacao) : null,
  quantidade: i.quantidade,
  precoPraticado: i.precoPraticado,
})

export function CadastroPedidos({
  atualizarOperacoes,
}: {
  atualizarOperacoes: () => void
}) {
  const { estado, empresa, usuario } = useAutenticacao()
  if (estado !== "autenticado" || !empresa) return null
  return (
    <Cadastro
      key={`${usuario?.email}:${empresa.id}`}
      empresaId={empresa.id}
      identidade={`${usuario?.email}:${empresa.id}`}
      atualizarOperacoes={atualizarOperacoes}
    />
  )
}

function Cadastro({
  empresaId,
  identidade,
  atualizarOperacoes,
}: {
  empresaId: number
  identidade: string
  atualizarOperacoes: () => void
}) {
  const { requisitar } = useAutenticacao()
  const [busca, setBusca] = useState("")
  const [status, setStatus] = useState("")
  const [pagina, setPagina] = useState(1)
  const [revisao, setRevisao] = useState(0)
  const [lista, setLista] = useState<{
    dados: PedidoApi[]
    paginacao: { totalPaginas: number }
  } | null>(null)
  const [erro, setErro] = useState("")
  const [dialogo, setDialogo] = useState<"novo" | number | null>(null)
  const [carregando, setCarregando] = useState(true)
  useEffect(() => {
    const abortar = new AbortController()
    const timer = setTimeout(() => {
      setCarregando(true)
      const query = new URLSearchParams({
        busca,
        pagina: String(pagina),
        limite: "10",
        ...(status ? { status } : {}),
      })
      requisitar(`/api/pedidos?${query}`, {
        signal: abortar.signal,
        headers: { "X-Empresa-Id": String(empresaId) },
      })
        .then(
          lerPedido<{
            dados: PedidoApi[]
            paginacao: { totalPaginas: number }
          }>,
        )
        .then((dados) => {
          if (!abortar.signal.aborted) {
            setLista(dados)
            setErro("")
          }
        })
        .catch((e: Error) => {
          if (!abortar.signal.aborted) {
            setErro(e.message)
            setLista(null)
          }
        })
        .finally(() => {
          if (!abortar.signal.aborted) setCarregando(false)
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      abortar.abort()
    }
  }, [busca, status, pagina, revisao, requisitar, empresaId])
  return (
    <section
      className="space-y-4 rounded-xl border p-4"
      aria-label="Cadastro de pedidos"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Pedidos de venda</h2>
        <Button onClick={() => setDialogo("novo")}>Novo pedido</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="busca-pedidos">
            Número ou nome do cliente
          </FieldLabel>
          <Input
            id="busca-pedidos"
            maxLength={100}
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(1)
            }}
          />
        </Field>
        <SearchSelect
          label="Status do pedido"
          value={status}
          options={[
            { value: "", label: "Todos" },
            ...statusPedidos.map((s) => ({
              value: s,
              label: s.replaceAll("_", " "),
            })),
          ]}
          onValueChange={(v) => {
            setStatus(v)
            setPagina(1)
          }}
        />
      </div>
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>
            {erro}
            <Button variant="outline" onClick={() => setRevisao((v) => v + 1)}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {carregando ? (
        <Skeleton className="h-40" />
      ) : (
        lista && (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.dados.map((p) => (
                  <TableRow key={p.idPedido}>
                    <TableCell>{p.numero}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {p.status.replaceAll("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatarMoeda(p.total)}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        onClick={() => setDialogo(p.idPedido)}
                      >
                        Consultar{p.status === "RASCUNHO" ? " / editar" : ""}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!lista.dados.length && (
              <p className="text-sm text-muted-foreground">
                Nenhum pedido encontrado.
              </p>
            )}
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                disabled={pagina <= 1}
                onClick={() => setPagina((v) => v - 1)}
              >
                Anterior
              </Button>
              <span>Página {pagina}</span>
              <Button
                variant="outline"
                disabled={pagina >= lista.paginacao.totalPaginas}
                onClick={() => setPagina((v) => v + 1)}
              >
                Próxima
              </Button>
            </div>
          </>
        )
      )}
      {dialogo !== null && (
        <EditorPedido
          key={dialogo}
          id={dialogo}
          empresaId={empresaId}
          identidade={identidade}
          fechar={() => setDialogo(null)}
          atualizar={() => {
            setRevisao((v) => v + 1)
            atualizarOperacoes()
          }}
        />
      )}
    </section>
  )
}

function EditorPedido({
  id,
  empresaId,
  identidade,
  fechar,
  atualizar,
}: {
  id: "novo" | number
  empresaId: number
  identidade: string
  fechar: () => void
  atualizar: () => void
}) {
  const { requisitar } = useAutenticacao()
  const [pedido, setPedido] = useState<PedidoApi | null>(null)
  const chaveStorage = `erp-pedido-rascunho:${identidade}`
  const [tentativaInicial] = useState(() => {
    if (id !== "novo") return null
    try {
      const salvo = sessionStorage.getItem(chaveStorage)
      if (!salvo) return null
      const tentativa = JSON.parse(salvo) as { chave: string; body: string }
      if (
        typeof tentativa.chave !== "string" ||
        typeof tentativa.body !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(tentativa.chave)
      )
        return null
      const corpo = rascunhoPedidoSchema.parse(JSON.parse(tentativa.body))
      return { tentativa, corpo }
    } catch {
      return null
    }
  })
  const [opcoes, setOpcoes] = useState<OpcoesPedidos>({
    clientes: [],
    produtos: [],
  })
  const [busca, setBusca] = useState("")
  const [cliente, setCliente] = useState(
    tentativaInicial ? String(tentativaInicial.corpo.idCliente) : "",
  )
  const [data, setData] = useState(
    tentativaInicial?.corpo.dataEntregaPrevista ?? "",
  )
  const [observacao, setObservacao] = useState(
    tentativaInicial?.corpo.observacao ?? "",
  )
  const [itens, setItens] = useState<Linha[]>(
    tentativaInicial?.corpo.itens.map((i) => ({
      ...i,
      idProduto: String(i.idProduto),
      idVariacao: i.idVariacao ? String(i.idVariacao) : "",
    })) ?? [novaLinha()],
  )
  const [editandoItem, setEditandoItem] = useState<number | null>(null)
  const [remover, setRemover] = useState<ItemPedidoApi | null>(null)
  const [erro, setErro] = useState("")
  const [erroOpcoes, setErroOpcoes] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const trava = useRef(false)
  const pendente = useRef<{ chave: string; body: string } | null>(
    tentativaInicial?.tentativa ?? null,
  )
  const [repetir, setRepetir] = useState(!!tentativaInicial)
  const [revisao, setRevisao] = useState(0)
  const [revisaoOpcoes, setRevisaoOpcoes] = useState(0)
  const headers = { "X-Empresa-Id": String(empresaId) }
  const podeEditar = id === "novo" || pedido?.status === "RASCUNHO"
  const cabecalhoAlterado =
    !!pedido &&
    (cliente !== String(pedido.idCliente) ||
      data !== (pedido.dataEntregaPrevista ?? "") ||
      observacao !== (pedido.observacao ?? ""))

  useEffect(() => {
    if (id === "novo") return
    const controller = new AbortController()
    requisitar(`/api/pedidos/${id}`, {
      signal: controller.signal,
      headers: { "X-Empresa-Id": String(empresaId) },
    })
      .then(lerPedido<PedidoApi>)
      .then((p) => {
        if (controller.signal.aborted) return
        setPedido(p)
        setCliente(String(p.idCliente))
        setData(p.dataEntregaPrevista ?? "")
        setObservacao(p.observacao ?? "")
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setErro(e.message)
      })
    return () => controller.abort()
  }, [id, requisitar, empresaId, revisao])

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      requisitar(`/api/pedidos/opcoes?busca=${encodeURIComponent(busca)}`, {
        signal: controller.signal,
        headers: { "X-Empresa-Id": String(empresaId) },
      })
        .then(lerPedido<OpcoesPedidos>)
        .then((o) => {
          if (controller.signal.aborted) return
          setOpcoes((anterior) => ({
            clientes: [
              ...new Map(
                [...anterior.clientes, ...o.clientes].map((v) => [v.id, v]),
              ).values(),
            ],
            produtos: [
              ...new Map(
                [...anterior.produtos, ...o.produtos].map((v) => [v.id, v]),
              ).values(),
            ],
          }))
          setErroOpcoes("")
        })
        .catch((e: Error) => {
          if (!controller.signal.aborted) setErroOpcoes(e.message)
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [busca, empresaId, requisitar, revisaoOpcoes])

  async function gravar(url: string, metodo: string, body?: unknown) {
    if (trava.current) return
    trava.current = true
    setOcupado(true)
    setErro("")
    try {
      const criacao = id === "novo"
      if (criacao && !pendente.current) {
        pendente.current = {
          chave: crypto.randomUUID(),
          body: JSON.stringify(body),
        }
      }
      if (criacao)
        sessionStorage.setItem(chaveStorage, JSON.stringify(pendente.current))
      const resposta = await requisitar(url, {
        method: metodo,
        headers: {
          ...headers,
          "Content-Type": "application/json",
          ...(criacao
            ? { "Idempotency-Key": pendente.current!.chave }
            : { "If-Match": `"${pedido!.versao}"` }),
        },
        body: criacao
          ? pendente.current!.body
          : body === undefined
            ? undefined
            : JSON.stringify(body),
      })
      if (criacao && podeDescartarTentativa(resposta.status, repetir)) {
        sessionStorage.removeItem(chaveStorage)
        pendente.current = null
        setRepetir(false)
      }
      await lerPedido(resposta)
      atualizar()
      toast.success("Pedido salvo.")
      if (criacao) {
        sessionStorage.removeItem(chaveStorage)
        pendente.current = null
        fechar()
      } else {
        setPedido(null)
        setRevisao((v) => v + 1)
        if (url.includes("/itens")) {
          setEditandoItem(null)
          setItens([novaLinha()])
        }
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.")
      if (id === "novo" && pendente.current) setRepetir(true)
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }
  function editar(i: ItemPedidoApi) {
    setEditandoItem(i.idItem)
    setItens([
      {
        idProduto: String(i.idProduto),
        idVariacao: i.idVariacao ? String(i.idVariacao) : "",
        quantidade: i.quantidade,
        precoPraticado: i.precoPraticado,
      },
    ])
  }
  function salvarItem(e: FormEvent) {
    e.preventDefault()
    const entrada = itemPedidoInputSchema.safeParse(prepararItem(itens[0]))
    const produto = opcoes.produtos.find(
      (p) => String(p.id) === itens[0].idProduto,
    )
    if (!entrada.success || (produto?.temGrade && !itens[0].idVariacao)) {
      setErro(
        "Revise o produto, a variação, a quantidade positiva e o preço do item. Use ponto para os decimais.",
      )
      return
    }
    void gravar(
      `/api/pedidos/${id}/itens${editandoItem ? `/${editandoItem}` : ""}`,
      editandoItem ? "PATCH" : "POST",
      entrada.data,
    )
  }
  function salvar(e: FormEvent) {
    e.preventDefault()
    if (id === "novo") {
      const chaves = itens.map((i) => `${i.idProduto}:${i.idVariacao}`)
      if (new Set(chaves).size !== chaves.length) {
        setErro("Produto e variação repetidos no pedido.")
        return
      }
      const entrada = rascunhoPedidoSchema.safeParse({
        idCliente: Number(cliente),
        dataEntregaPrevista: data,
        observacao: observacao.trim() || null,
        itens: itens.map(prepararItem),
      })
      if (!entrada.success) {
        setErro(
          "Revise cliente, entrega, produtos, quantidades e preços. Use ponto para os decimais.",
        )
        return
      }
      if (
        itens.some(
          (i) =>
            opcoes.produtos.find((p) => String(p.id) === i.idProduto)
              ?.temGrade && !i.idVariacao,
        )
      ) {
        setErro("Selecione a cor e o tamanho dos produtos com grade.")
        return
      }
      void gravar("/api/pedidos", "POST", entrada.data)
    } else
      void gravar(`/api/pedidos/${id}`, "PATCH", {
        idCliente: Number(cliente),
        dataEntregaPrevista: data,
        observacao: observacao.trim() || null,
      })
  }
  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !ocupado) fechar()
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {id === "novo" ? "Novo pedido" : `Pedido ${pedido?.numero ?? id}`}
          </DialogTitle>
          <DialogDescription>
            O número e o status são definidos pelo servidor. A criação salva um
            rascunho.
          </DialogDescription>
        </DialogHeader>
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        {repetir ? (
          <Alert>
            <AlertDescription>
              Há uma criação sem confirmação. Repita a mesma tentativa para
              recuperar o pedido com segurança.
              <Button
                disabled={ocupado}
                onClick={() => void gravar("/api/pedidos", "POST")}
              >
                Repetir criação
              </Button>
            </AlertDescription>
          </Alert>
        ) : id !== "novo" && !pedido ? (
          <Button onClick={() => setRevisao((v) => v + 1)}>
            Carregar pedido
          </Button>
        ) : (
          <>
            {pedido && (
              <p>
                Status {pedido.status} · Total {formatarMoeda(pedido.total)}
              </p>
            )}
            <form onSubmit={salvar} className="space-y-4">
              <fieldset disabled={ocupado || !podeEditar} className="space-y-4">
                <Field>
                  <FieldLabel htmlFor="busca-opcoes-pedido">
                    Buscar cliente ou produto (até 50 resultados por busca)
                  </FieldLabel>
                  <Input
                    id="busca-opcoes-pedido"
                    value={busca}
                    maxLength={100}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </Field>
                {erroOpcoes && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {erroOpcoes}
                      <Button
                        type="button"
                        onClick={() => setRevisaoOpcoes((v) => v + 1)}
                      >
                        Tentar novamente
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <Field>
                  <FieldLabel htmlFor="cliente-pedido">Cliente</FieldLabel>
                  <SearchSelect
                    id="cliente-pedido"
                    label="Cliente"
                    value={cliente}
                    onValueChange={setCliente}
                    options={[
                      ...(pedido &&
                      !opcoes.clientes.some((c) => c.id === pedido.idCliente)
                        ? [
                            {
                              value: String(pedido.idCliente),
                              label: `Cliente do pedido #${pedido.idCliente}`,
                            },
                          ]
                        : []),
                      ...opcoes.clientes.map((c) => ({
                        value: String(c.id),
                        label: c.nome_razao_social,
                      })),
                    ]}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="entrega-pedido">
                    Previsão de entrega
                  </FieldLabel>
                  <Input
                    id="entrega-pedido"
                    type="date"
                    required
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="observacao-pedido">
                    Observação
                  </FieldLabel>
                  <Textarea
                    id="observacao-pedido"
                    maxLength={2000}
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                  />
                </Field>
                {id === "novo" && (
                  <Itens itens={itens} alterar={setItens} opcoes={opcoes} />
                )}
                <Button
                  type="submit"
                  disabled={
                    !cliente ||
                    !data ||
                    (id === "novo" && itens.some((i) => !i.idProduto))
                  }
                >
                  {ocupado
                    ? "Salvando…"
                    : id === "novo"
                      ? "Salvar pedido"
                      : "Salvar dados do pedido"}
                </Button>
              </fieldset>
            </form>
            {pedido && (
              <section className="space-y-3">
                <h3 className="font-semibold">Itens do pedido</h3>
                {cabecalhoAlterado && podeEditar && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Salve os dados do pedido antes de alterar os itens.
                  </p>
                )}
                {pedido.itens.map((i) => (
                  <div
                    key={i.idItem}
                    className="flex flex-wrap items-center gap-3 rounded-md border p-3"
                  >
                    <span>
                      {i.descricao} · {i.quantidade} ·{" "}
                      {formatarMoeda(i.precoPraticado)} · Subtotal{" "}
                      {formatarMoeda(i.subtotal)}
                    </span>
                    {podeEditar && (
                      <>
                        <Button
                          disabled={ocupado || cabecalhoAlterado}
                          variant="outline"
                          onClick={() => editar(i)}
                        >
                          Editar item
                        </Button>
                        <Button
                          disabled={
                            ocupado ||
                            cabecalhoAlterado ||
                            pedido.itens.length <= 1
                          }
                          variant="outline"
                          onClick={() => setRemover(i)}
                        >
                          Remover item
                        </Button>
                      </>
                    )}
                  </div>
                ))}
                {podeEditar && (
                  <form onSubmit={salvarItem}>
                    <fieldset
                      disabled={ocupado || cabecalhoAlterado}
                      className="space-y-3"
                    >
                      <h3>
                        {editandoItem
                          ? "Editar item selecionado"
                          : "Adicionar item"}
                      </h3>
                      <Itens
                        itens={itens}
                        alterar={setItens}
                        opcoes={opcoes}
                        unico
                      />
                      <Button type="submit" disabled={!itens[0].idProduto}>
                        {editandoItem ? "Salvar item" : "Adicionar ao pedido"}
                      </Button>
                      {editandoItem && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setEditandoItem(null)
                            setItens([novaLinha()])
                          }}
                        >
                          Cancelar edição
                        </Button>
                      )}
                    </fieldset>
                  </form>
                )}
              </section>
            )}
            {id !== "novo" && (
              <Button
                variant="outline"
                disabled={ocupado}
                onClick={() => {
                  setErro("")
                  setPedido(null)
                  setEditandoItem(null)
                  setItens([novaLinha()])
                  setRevisao((v) => v + 1)
                }}
              >
                Consultar versão atual
              </Button>
            )}
          </>
        )}
        <AlertDialog
          open={!!remover}
          onOpenChange={(aberto) => {
            if (!aberto) setRemover(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover item do pedido?</AlertDialogTitle>
              <AlertDialogDescription>
                {remover?.descricao} será removido e o total será recalculado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (remover)
                    void gravar(
                      `/api/pedidos/${id}/itens/${remover.idItem}`,
                      "DELETE",
                    )
                  setRemover(null)
                }}
              >
                Remover item
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

function Itens({
  itens,
  alterar,
  opcoes,
  unico = false,
}: {
  itens: Linha[]
  alterar: (v: Linha[]) => void
  opcoes: OpcoesPedidos
  unico?: boolean
}) {
  function campo(index: number, valores: Partial<Linha>) {
    alterar(itens.map((i, n) => (n === index ? { ...i, ...valores } : i)))
  }
  return (
    <div className="space-y-4">
      {itens.map((i, index) => {
        const produto = opcoes.produtos.find(
          (p) => String(p.id) === i.idProduto,
        )
        return (
          <div key={index} className="space-y-3 rounded-md border p-3">
            <Field>
              <FieldLabel htmlFor={`produto-pedido-${index}`}>
                Produto do item {index + 1}
              </FieldLabel>
              <SearchSelect
                id={`produto-pedido-${index}`}
                label={`Produto do item ${index + 1}`}
                value={i.idProduto}
                onValueChange={(v) =>
                  campo(index, {
                    idProduto: v,
                    idVariacao: "",
                    precoPraticado:
                      opcoes.produtos.find((p) => String(p.id) === v)?.preco ??
                      "0.00",
                  })
                }
                options={[
                  ...(i.idProduto && !produto
                    ? [
                        {
                          value: i.idProduto,
                          label: `Produto atual #${i.idProduto}`,
                        },
                      ]
                    : []),
                  ...opcoes.produtos.map((p) => ({
                    value: String(p.id),
                    label: `${p.codigo} · ${p.nome}`,
                  })),
                ]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`variacao-pedido-${index}`}>
                Cor / tamanho
              </FieldLabel>
              <SearchSelect
                id={`variacao-pedido-${index}`}
                label={`Cor / tamanho do item ${index + 1}`}
                value={i.idVariacao}
                onValueChange={(v) => campo(index, { idVariacao: v })}
                options={[
                  ...(!produto?.temGrade
                    ? [{ value: "", label: "Sem variação" }]
                    : []),
                  ...(i.idVariacao &&
                  !produto?.variacoes.some((v) => String(v.id) === i.idVariacao)
                    ? [
                        {
                          value: i.idVariacao,
                          label: `Variação atual #${i.idVariacao}`,
                        },
                      ]
                    : []),
                  ...(produto?.variacoes ?? []).map((v) => ({
                    value: String(v.id),
                    label: `${v.cor} / ${v.tamanho}`,
                  })),
                ]}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`quantidade-pedido-${index}`}>
                  Quantidade
                </FieldLabel>
                <Input
                  id={`quantidade-pedido-${index}`}
                  required
                  inputMode="decimal"
                  pattern="(0|[1-9][0-9]{0,11})(\.[0-9]{1,3})?"
                  value={i.quantidade}
                  onChange={(e) => campo(index, { quantidade: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`preco-pedido-${index}`}>
                  Preço unitário (R$)
                </FieldLabel>
                <Input
                  id={`preco-pedido-${index}`}
                  required
                  inputMode="decimal"
                  pattern="(0|[1-9][0-9]{0,12})(\.[0-9]{1,2})?"
                  value={i.precoPraticado}
                  onChange={(e) =>
                    campo(index, { precoPraticado: e.target.value })
                  }
                />
              </Field>
            </div>
            {!unico && (
              <Button
                type="button"
                variant="outline"
                disabled={itens.length <= 1}
                onClick={() => alterar(itens.filter((_, n) => n !== index))}
              >
                Remover item
              </Button>
            )}
          </div>
        )
      })}
      {!unico && (
        <Button
          type="button"
          variant="outline"
          disabled={itens.length >= 100}
          onClick={() => alterar([...itens, novaLinha()])}
        >
          Adicionar item
        </Button>
      )}
    </div>
  )
}

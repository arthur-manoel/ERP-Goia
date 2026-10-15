"use client"
import { useEffect, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  paraEscala,
  quantidadePendente,
  quantidadeValida,
} from "@/modules/compras/compras.regras"
import { BASE, mensagem, type ComprasApi } from "../api"
import { useExecutar } from "../executar"
import type { CompraDetalhe, Pedido } from "../tipos"
import {
  Campo,
  EditorItens,
  moeda,
  numero,
  quantidade,
  SeletorUnico,
  validarItens,
  type ItemForm,
} from "./comuns"

type Ref = { id: number; nome: string } | null

/** Cria uma compra a partir de um pedido emitido (ou avulsa, sem pedido). */
export function DialogoCompra({
  api,
  pedido,
  onFechar,
  onSalvo,
}: {
  api: ComprasApi
  pedido?: { id: number; numero: string }
  onFechar: () => void
  onSalvo: () => void
}) {
  const [modo, setModo] = useState<"pedido" | "avulsa">("pedido")
  const [idPedido, setIdPedido] = useState(pedido ? String(pedido.id) : "")
  const [pedidos, setPedidos] = useState<{
    carregado: boolean
    lista: Pedido[]
    erro: string
  }>({ carregado: false, lista: [], erro: "" })
  const [local, setLocal] = useState<Ref>(null)
  const [fornecedor, setFornecedor] = useState<Ref>(null)
  const [itens, setItens] = useState<ItemForm[]>([])
  const [obs, setObs] = useState("")
  const { ocupado, erro, setErro, executar } = useExecutar()

  useEffect(() => {
    if (pedido) return
    let vivo = true
    api
      .get<{ pedidos: Pedido[] }>(`${BASE}/pedidos?status=EMITIDO&limite=100`)
      .then(
        (r) =>
          vivo &&
          setPedidos({
            carregado: true,
            lista: r.pedidos.filter((p) => !p.compra),
            erro: "",
          }),
        (e: unknown) =>
          vivo && setPedidos({ carregado: true, lista: [], erro: mensagem(e) }),
      )
    return () => {
      vivo = false
    }
  }, [api, pedido])

  async function salvar() {
    if (!local) return setErro("Selecione o local de estoque de destino.")
    let corpo: Record<string, unknown> = {
      idLocalEstoque: local.id,
      observacao: obs.trim() || null,
    }
    if (modo === "pedido") {
      if (!idPedido) return setErro("Selecione o pedido de compra.")
      corpo = { ...corpo, idPedidoCompra: Number(idPedido) }
    } else {
      if (!fornecedor) return setErro("Selecione o fornecedor.")
      const problema = validarItens(itens, true)
      if (problema) return setErro(problema)
      corpo = {
        ...corpo,
        idFornecedor: fornecedor.id,
        itens: itens.map((i) => ({
          idProduto: i.idProduto,
          quantidade: numero(i.quantidade),
          valorUnitario: numero(i.valorUnitario),
        })),
      }
    }
    const r = await executar(
      () => api.enviar(`${BASE}/compras`, "POST", corpo),
      "Compra registrada. Aguardando recebimento.",
    )
    if (r) {
      onSalvo()
      onFechar()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            Nova compra{pedido ? ` — pedido ${pedido.numero}` : ""}
          </DialogTitle>
          <DialogDescription>
            A compra herda fornecedor e itens do pedido e fica aguardando
            recebimento.
          </DialogDescription>
        </DialogHeader>
        {!pedido && (
          <Campo rotulo="Origem">
            <NativeSelect
              value={modo}
              onChange={(e) => setModo(e.target.value as "pedido" | "avulsa")}
              className="w-full"
            >
              <NativeSelectOption value="pedido">
                A partir de um pedido de compra emitido
              </NativeSelectOption>
              <NativeSelectOption value="avulsa">
                Compra avulsa (sem pedido)
              </NativeSelectOption>
            </NativeSelect>
          </Campo>
        )}
        {modo === "pedido" && !pedido && (
          <Campo
            rotulo="Pedido de compra"
            ajuda={
              pedidos.carregado && !pedidos.lista.length && !pedidos.erro
                ? "Não há pedidos emitidos sem compra."
                : undefined
            }
          >
            <NativeSelect
              className="w-full"
              value={idPedido}
              onChange={(e) => setIdPedido(e.target.value)}
              disabled={!pedidos.carregado}
            >
              <NativeSelectOption value="">
                {pedidos.carregado ? "Selecione…" : "Carregando…"}
              </NativeSelectOption>
              {pedidos.lista.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {p.numero} — {p.fornecedor.nome} — {moeda(p.valorTotal)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {pedidos.erro && (
              <p className="text-sm text-destructive">{pedidos.erro}</p>
            )}
          </Campo>
        )}
        {modo === "avulsa" && (
          <>
            <Campo rotulo="Fornecedor">
              <SeletorUnico
                api={api}
                tipo="fornecedores"
                valor={fornecedor}
                onChange={setFornecedor}
                placeholder="fornecedor"
              />
            </Campo>
            <Campo rotulo="Itens">
              <EditorItens
                api={api}
                itens={itens}
                onChange={setItens}
                comValores
              />
            </Campo>
          </>
        )}
        <Campo rotulo="Local de estoque de destino">
          <SeletorUnico
            api={api}
            tipo="locais"
            valor={local}
            onChange={setLocal}
            placeholder="local de estoque"
          />
        </Campo>
        <Campo rotulo="Observações">
          <Textarea
            maxLength={255}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </Campo>
        {erro && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={ocupado} onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={ocupado} onClick={() => void salvar()}>
            Registrar compra
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Registro de recebimento. Com pedido vinculado, aceita quantidade menor (fica pendente). */
export function DialogoReceber({
  api,
  compra,
  onFechar,
  onSalvo,
}: {
  api: ComprasApi
  compra: CompraDetalhe
  onFechar: () => void
  onSalvo: () => void
}) {
  const parcialPermitido = compra.pedido !== null
  const [qtds, setQtds] = useState<Record<number, string>>(
    Object.fromEntries(
      compra.itens.map((i) => [i.idProduto, String(Number(i.quantidade))]),
    ),
  )
  const [obs, setObs] = useState(compra.observacao ?? "")
  const { ocupado, erro, setErro, executar } = useExecutar()

  async function salvar() {
    const itens: Array<{ idProduto: number; quantidade: string }> = []
    for (const i of compra.itens) {
      const q = numero(qtds[i.idProduto] ?? "")
      if (q === "" || paraEscala(q, 3) === BigInt(0)) continue // zero = nada recebido (fica pendente)
      if (!quantidadeValida(q))
        return setErro(`${i.nome}: quantidade inválida.`)
      if (
        (paraEscala(q, 3) ?? BigInt(0)) >
        (paraEscala(i.quantidadePedida ?? i.quantidade, 3) ?? BigInt(0))
      )
        return setErro(
          `${i.nome}: a quantidade recebida não pode exceder o pedido (${quantidade(i.quantidadePedida ?? i.quantidade)}).`,
        )
      itens.push({ idProduto: i.idProduto, quantidade: q })
    }
    if (!itens.length)
      return setErro("Informe a quantidade recebida de ao menos um item.")
    const r = await executar(
      () =>
        api.enviar(`${BASE}/compras/${compra.id}/receber`, "POST", {
          itens,
          observacao: obs.trim() || null,
        }),
      "Recebimento registrado.",
    )
    if (r) {
      onSalvo()
      onFechar()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Registrar recebimento — {compra.codigo}</DialogTitle>
          <DialogDescription>
            {parcialPermitido
              ? "Informe o que foi efetivamente recebido; o restante permanece como pendente no pedido."
              : "Compra sem pedido: o recebimento deve ser integral."}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead className="text-right">Pedida</TableHead>
                <TableHead className="w-36">Recebida</TableHead>
                <TableHead className="text-right">Pendente</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compra.itens.map((i) => {
                const pedida = i.quantidadePedida ?? i.quantidade
                const q = numero(qtds[i.idProduto] ?? "")
                const pend = quantidadeValida(q)
                  ? quantidadePendente(pedida, q)
                  : pedida
                return (
                  <TableRow key={i.id}>
                    <TableCell>
                      <div className="font-medium">{i.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.codigo}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {quantidade(pedida)} {i.unidade}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Quantidade recebida de ${i.nome}`}
                        inputMode="decimal"
                        disabled={!parcialPermitido}
                        value={qtds[i.idProduto] ?? ""}
                        onChange={(e) =>
                          setQtds({ ...qtds, [i.idProduto]: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {quantidade(pend)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
        <Campo rotulo="Observações">
          <Textarea
            maxLength={255}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
        </Campo>
        {erro && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={ocupado} onClick={onFechar}>
            Cancelar
          </Button>
          <Button disabled={ocupado} onClick={() => void salvar()}>
            Confirmar recebimento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

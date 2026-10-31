"use client"
import { useState } from "react"
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
  limiteObservacaoRecebimento,
  paraEscala,
  quantidadePendente,
  quantidadeValida,
} from "@/modules/compras/compras.regras"
import { BASE, type ComprasApi } from "../api"
import { useExecutar } from "../executar"
import type { CompraDetalhe } from "../tipos"
import {
  Campo,
  EditorItens,
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
  const [pedidoSel, setPedidoSel] = useState<Ref>(null)
  const [local, setLocal] = useState<Ref>(null)
  const [fornecedor, setFornecedor] = useState<Ref>(null)
  const [itens, setItens] = useState<ItemForm[]>([])
  const [obs, setObs] = useState("")
  const { ocupado, erro, setErro, executar } = useExecutar()

  async function salvar() {
    if (!local) return setErro("Selecione o local de estoque de destino.")
    let corpo: Record<string, unknown> = {
      idLocalEstoque: local.id,
      observacao: obs.trim() || null,
    }
    if (modo === "pedido") {
      const idEscolhido = pedido ? pedido.id : pedidoSel?.id
      if (!idEscolhido) return setErro("Selecione o pedido de compra.")
      corpo = { ...corpo, idPedidoCompra: idEscolhido }
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
            ajuda="Pedidos emitidos sem compra ativa. Digite para buscar por número ou fornecedor."
          >
            <SeletorUnico
              api={api}
              tipo="pedidos"
              filtros={{ status: "EMITIDO", ativas: "false" }}
              valor={pedidoSel}
              onChange={setPedidoSel}
              placeholder="Buscar pedido emitido"
            />
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

/**
 * Registro de recebimento (total ou parcial). Informe o que chegou AGORA: a quantidade se soma ao
 * que já foi recebido e o restante continua pendente, podendo ser recebido em novo registro.
 */
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
  // Pendente de cada item: usa o que a API informa; sem isso, comprada − já recebida.
  const pendenteDe = (i: CompraDetalhe["itens"][number]) =>
    i.quantidadePendente ??
    quantidadePendente(i.quantidade, i.quantidadeRecebida)
  // Sugere o pendente de cada item (recebimento integral do que falta); só itens com pendência.
  const pendentes = compra.itens.filter(
    (i) => (paraEscala(pendenteDe(i), 3) ?? BigInt(0)) > BigInt(0),
  )
  const [qtds, setQtds] = useState<Record<number, string>>(
    Object.fromEntries(
      pendentes.map((i) => [i.idProduto, String(Number(pendenteDe(i)))]),
    ),
  )
  const [obs, setObs] = useState("")
  const [setor, setSetor] = useState<Ref>(null)
  // Mesma chave em toda tentativa deste diálogo: reenvio após falha de rede não duplica o recebimento/estoque.
  const [chave] = useState(() => crypto.randomUUID())
  const limiteObservacao = limiteObservacaoRecebimento(compra.codigo, chave)
  const { ocupado, erro, setErro, executar } = useExecutar()

  async function salvar() {
    if (Array.from(obs.trim()).length > limiteObservacao)
      return setErro(`Observação: use até ${limiteObservacao} caracteres.`)
    const itens: Array<{ idProduto: number; quantidade: string }> = []
    for (const i of pendentes) {
      const q = numero(qtds[i.idProduto] ?? "")
      if (q === "" || paraEscala(q, 3) === BigInt(0)) continue // zero = nada recebido agora
      if (!quantidadeValida(q))
        return setErro(`${i.nome}: quantidade inválida.`)
      if (
        (paraEscala(q, 3) ?? BigInt(0)) >
        (paraEscala(pendenteDe(i), 3) ?? BigInt(0))
      )
        return setErro(
          `${i.nome}: a quantidade recebida não pode exceder o pendente (${quantidade(pendenteDe(i))}).`,
        )
      itens.push({ idProduto: i.idProduto, quantidade: q })
    }
    if (!itens.length)
      return setErro("Informe a quantidade recebida de ao menos um item.")
    const r = await executar(
      () =>
        api.enviar(`${BASE}/compras/${compra.id}/receber`, "POST", {
          itens,
          idSetorDestino: setor?.id ?? null,
          chaveIdempotencia: chave,
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
            Informe o que foi efetivamente recebido; o restante permanece como
            pendente.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead className="text-right">Comprada</TableHead>
                <TableHead className="text-right">Já recebida</TableHead>
                <TableHead className="w-36">Receber agora</TableHead>
                <TableHead className="text-right">Pendente após</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendentes.map((i) => {
                const q = numero(qtds[i.idProduto] ?? "")
                const pend = quantidadeValida(q)
                  ? quantidadePendente(pendenteDe(i), q)
                  : pendenteDe(i)
                return (
                  <TableRow key={i.id}>
                    <TableCell>
                      <div className="font-medium">{i.nome}</div>
                      <div className="text-xs text-muted-foreground">
                        {i.codigo}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {quantidade(i.quantidade)} {i.unidade}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {quantidade(i.quantidadeRecebida)}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Quantidade recebida agora de ${i.nome}`}
                        inputMode="decimal"
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
        <Campo
          rotulo="Setor de destino no estoque"
          ajuda="Necessário apenas na primeira entrada de cada insumo neste local; depois o setor já fica definido."
        >
          <SeletorUnico
            api={api}
            tipo="setores"
            valor={setor}
            onChange={setSetor}
            placeholder="Buscar setor"
          />
        </Campo>
        <Campo
          rotulo="Observações deste recebimento"
          ajuda={`Use até ${limiteObservacao} caracteres.`}
        >
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} />
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

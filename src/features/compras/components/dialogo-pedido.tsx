"use client"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { BASE, type ComprasApi } from "../api"
import { useExecutar } from "../executar"
import type { PedidoDetalhe } from "../tipos"
import { Campo, EditorItens, numero, SeletorUnico, validarItens, type ItemForm } from "./comuns"

export type PedidoInicial = { idRequisicaoCompra: number; numero: string; itens: ItemForm[]; observacao: string | null }

export function DialogoPedido({
  api, existente, inicial, onFechar, onSalvo,
}: { api: ComprasApi; existente?: PedidoDetalhe; inicial?: PedidoInicial; onFechar: () => void; onSalvo: () => void }) {
  const [fornecedor, setFornecedor] = useState<{ id: number; nome: string } | null>(
    existente ? { id: existente.fornecedor.id, nome: existente.fornecedor.nome } : null,
  )
  const [obs, setObs] = useState(existente?.observacao ?? inicial?.observacao ?? "")
  const [itens, setItens] = useState<ItemForm[]>(
    existente
      ? existente.itens.map((i) => ({ idProduto: i.idProduto, codigo: i.codigo, nome: i.nome, unidade: i.unidade, quantidade: String(Number(i.quantidadePedida)), valorUnitario: i.valorUnitario }))
      : (inicial?.itens ?? []),
  )
  const { ocupado, erro, setErro, executar } = useExecutar()

  async function salvar(emitir: boolean) {
    if (!fornecedor) return setErro("Selecione o fornecedor.")
    const problema = validarItens(itens, true)
    if (problema) return setErro(problema)
    const corpo = {
      idFornecedor: fornecedor.id,
      observacao: obs.trim() || null,
      itens: itens.map((i) => ({ idProduto: i.idProduto, quantidade: numero(i.quantidade), valorUnitario: numero(i.valorUnitario) })),
    }
    const r = existente
      ? await executar(() => api.enviar(`${BASE}/pedidos/${existente.id}`, "PATCH", corpo), "Pedido atualizado.")
      : await executar(
          () => api.enviar(`${BASE}/pedidos`, "POST", { ...corpo, emitir, idRequisicaoCompra: inicial?.idRequisicaoCompra ?? null }),
          emitir ? "Pedido emitido." : "Rascunho salvo.",
        )
    if (r) { onSalvo(); onFechar() }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{existente ? `Editar ${existente.numero}` : "Novo pedido de compra"}</DialogTitle>
          <DialogDescription>
            {inicial ? `Convertendo a solicitação ${inicial.numero}. ` : ""}O valor total é calculado a partir dos itens.
          </DialogDescription>
        </DialogHeader>
        <Campo rotulo="Fornecedor"><SeletorUnico api={api} tipo="fornecedores" valor={fornecedor} onChange={setFornecedor} placeholder="fornecedor" /></Campo>
        <Campo rotulo="Itens do pedido"><EditorItens api={api} itens={itens} onChange={setItens} comValores /></Campo>
        <Campo rotulo="Observações"><Textarea maxLength={255} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
        {erro && <Alert variant="destructive" role="alert"><AlertDescription>{erro}</AlertDescription></Alert>}
        <DialogFooter>
          <Button variant="outline" disabled={ocupado} onClick={onFechar}>Cancelar</Button>
          {existente ? (
            <Button disabled={ocupado} onClick={() => void salvar(false)}>Salvar alterações</Button>
          ) : (
            <>
              <Button variant="secondary" disabled={ocupado} onClick={() => void salvar(false)}>Salvar rascunho</Button>
              <Button disabled={ocupado} onClick={() => void salvar(true)}>Salvar e emitir</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

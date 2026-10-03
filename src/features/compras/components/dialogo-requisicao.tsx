"use client"
import { useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { BASE, type ComprasApi } from "../api"
import { useExecutar } from "../executar"
import type { RequisicaoDetalhe } from "../tipos"
import { Campo, EditorItens, numero, SeletorUnico, validarItens, type ItemForm } from "./comuns"

type Ref = { id: number; nome: string } | null

export function DialogoRequisicao({
  api, existente, onFechar, onSalvo,
}: { api: ComprasApi; existente?: RequisicaoDetalhe; onFechar: () => void; onSalvo: () => void }) {
  const [local, setLocal] = useState<Ref>(existente?.idLocalEstoque ? { id: existente.idLocalEstoque, nome: existente.local ?? "" } : null)
  const [setor, setSetor] = useState<Ref>(existente?.idSetorSolicitante ? { id: existente.idSetorSolicitante, nome: existente.setor ?? "" } : null)
  const [obs, setObs] = useState(existente?.observacao ?? "")
  const [itens, setItens] = useState<ItemForm[]>(
    existente?.itens.map((i) => ({ idProduto: i.idProduto, codigo: i.codigo, nome: i.nome, unidade: i.unidade, quantidade: String(Number(i.quantidade)), valorUnitario: "" })) ?? [],
  )
  const { ocupado, erro, setErro, executar } = useExecutar()

  async function salvar(enviar: boolean) {
    const problema = validarItens(itens, false)
    if (problema) return setErro(problema)
    const corpo = {
      idLocalEstoque: local?.id ?? null,
      idSetorSolicitante: setor?.id ?? null,
      observacao: obs.trim() || null,
      itens: itens.map((i) => ({ idProduto: i.idProduto, quantidade: numero(i.quantidade) })),
    }
    const r = existente
      ? await executar(() => api.enviar(`${BASE}/requisicoes/${existente.id}`, "PATCH", corpo), "Solicitação atualizada.")
      : await executar(() => api.enviar(`${BASE}/requisicoes`, "POST", { ...corpo, enviar }), enviar ? "Solicitação enviada." : "Rascunho salvo.")
    if (r) { onSalvo(); onFechar() }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !ocupado && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{existente ? `Editar ${existente.numero}` : "Nova solicitação de compra"}</DialogTitle>
          <DialogDescription>O número e a data são gerados pelo sistema. A solicitação não altera o estoque.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Local de estoque (opcional)"><SeletorUnico api={api} tipo="locais" valor={local} onChange={setLocal} placeholder="local de estoque" /></Campo>
          <Campo rotulo="Setor solicitante (opcional)"><SeletorUnico api={api} tipo="setores" valor={setor} onChange={setSetor} placeholder="setor" /></Campo>
        </div>
        <Campo rotulo="Itens solicitados"><EditorItens api={api} itens={itens} onChange={setItens} comValores={false} /></Campo>
        <Campo rotulo="Observações"><Textarea maxLength={255} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
        {erro && <Alert variant="destructive" role="alert"><AlertDescription>{erro}</AlertDescription></Alert>}
        <DialogFooter>
          <Button variant="outline" disabled={ocupado} onClick={onFechar}>Cancelar</Button>
          {existente ? (
            <Button disabled={ocupado} onClick={() => void salvar(false)}>Salvar alterações</Button>
          ) : (
            <>
              <Button variant="secondary" disabled={ocupado} onClick={() => void salvar(false)}>Salvar rascunho</Button>
              <Button disabled={ocupado} onClick={() => void salvar(true)}>Salvar e solicitar</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

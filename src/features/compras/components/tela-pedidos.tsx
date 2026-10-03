"use client"
import { useState } from "react"
import { Plus, ShoppingCart } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BASE, type ComprasApi } from "../api"
import { useExecutar } from "../executar"
import type { Lista, Pedido, PedidoDetalhe, ResumoStatus } from "../tipos"
import { useAtraso, useDetalhe, useLista } from "../use-lista"
import { ShellCompras } from "../shell"
import {
  BadgeStatus, BarraFiltros, CartoesResumo, ConfirmarAcao, data, EstadoLista, filtrosVazios, Fluxo, moeda, Paginador,
  quantidade, rotulosStatus, type Filtros,
} from "./comuns"
import { DialogoCompra } from "./dialogo-compra"
import { DialogoPedido } from "./dialogo-pedido"

type Resposta = Lista<"pedidos", Pedido, ResumoStatus & { valorEmAberto: string }>

export function TelaPedidos() {
  return (
    <ShellCompras titulo="Pedidos de compra" descricao="Formalize a aquisição junto ao fornecedor. O total é calculado a partir dos itens.">
      {(api) => <Conteudo api={api} />}
    </ShellCompras>
  )
}

function Conteudo({ api }: { api: ComprasApi }) {
  const [filtros, setFiltros] = useState<Filtros>(filtrosVazios)
  const [pagina, setPagina] = useState(1)
  const [aberto, setAberto] = useState<number | null>(null)
  const [dialogo, setDialogo] = useState<"novo" | { editar: PedidoDetalhe } | { compra: Pedido | PedidoDetalhe } | null>(null)
  const busca = useAtraso(filtros.busca.trim())
  const { dados, erro, carregando, recarregar } = useLista<Resposta>(
    api, `${BASE}/pedidos`, { busca, status: filtros.status, de: filtros.de, ate: filtros.ate }, pagina,
  )
  const s = dados?.resumo.porStatus ?? {}
  const total = Object.values(s).reduce((a, b) => a + b, 0)
  const filtrado = Boolean(filtros.busca || filtros.status || filtros.de || filtros.ate)

  return (
    <>
      {dados && total > 0 && (
        <CartoesResumo itens={[
          { rotulo: "Em rascunho", valor: s.RASCUNHO ?? 0 },
          { rotulo: "Pedidos em aberto", valor: (s.EMITIDO ?? 0) + (s.PARCIAL ?? 0) },
          { rotulo: "Recebidos", valor: s.RECEBIDO ?? 0 },
          { rotulo: "Valor em aberto", valor: moeda(dados.resumo.valorEmAberto) },
        ]} />
      )}
      <BarraFiltros valor={filtros} onChange={(f) => { setFiltros(f); setPagina(1) }} status={rotulosStatus("pedido")}
        placeholderBusca="Buscar por número ou fornecedor"
        acao={dados?.permissoes.criar ? <Button onClick={() => setDialogo("novo")}><Plus /> Novo pedido</Button> : undefined} />
      <EstadoLista carregando={carregando} erro={erro} vazio={!dados?.pedidos.length} filtrado={filtrado} onRecarregar={recarregar}
        icone={<ShoppingCart />} tituloVazio="Nenhum pedido de compra" descricaoVazio="Crie um pedido ou converta uma solicitação aprovada.">
        {dados && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Número</TableHead><TableHead>Data</TableHead><TableHead>Fornecedor</TableHead>
                  <TableHead>Origem</TableHead><TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead>
                  <TableHead className="w-20"><span className="sr-only">Ações</span></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {dados.pedidos.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono">{p.numero}</TableCell>
                      <TableCell>{data(p.dataPedido)}</TableCell>
                      <TableCell>{p.fornecedor.nome}</TableCell>
                      <TableCell className="font-mono text-xs">{p.requisicao?.numero ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.totalItens}</TableCell>
                      <TableCell className="text-right tabular-nums">{moeda(p.valorTotal)}</TableCell>
                      <TableCell><BadgeStatus tipo="pedido" status={p.status} /></TableCell>
                      <TableCell><Button variant="outline" size="sm" onClick={() => setAberto(p.id)} aria-label={`Ver ${p.numero}`}>Ver</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Paginador p={dados.paginacao} onPagina={setPagina} />
          </div>
        )}
      </EstadoLista>

      {aberto !== null && (
        <Detalhe api={api} id={aberto} podeEditar={dados?.permissoes.editar ?? false} podeCriar={dados?.permissoes.criar ?? false}
          onFechar={() => setAberto(null)} onMudou={recarregar}
          onEditar={(p) => { setAberto(null); setDialogo({ editar: p }) }}
          onGerarCompra={(p) => { setAberto(null); setDialogo({ compra: p }) }} />
      )}
      {dialogo === "novo" && <DialogoPedido api={api} onFechar={() => setDialogo(null)} onSalvo={recarregar} />}
      {dialogo && typeof dialogo === "object" && "editar" in dialogo && (
        <DialogoPedido api={api} existente={dialogo.editar} onFechar={() => setDialogo(null)} onSalvo={recarregar} />
      )}
      {dialogo && typeof dialogo === "object" && "compra" in dialogo && (
        <DialogoCompra api={api} pedido={{ id: dialogo.compra.id, numero: dialogo.compra.numero }} onFechar={() => setDialogo(null)} onSalvo={recarregar} />
      )}
    </>
  )
}

function Detalhe({
  api, id, podeEditar, podeCriar, onFechar, onMudou, onEditar, onGerarCompra,
}: {
  api: ComprasApi; id: number; podeEditar: boolean; podeCriar: boolean; onFechar: () => void; onMudou: () => void
  onEditar: (p: PedidoDetalhe) => void; onGerarCompra: (p: PedidoDetalhe) => void
}) {
  const [versao, setVersao] = useState(0)
  const [cancelando, setCancelando] = useState(false)
  const { dados, erro, carregando } = useDetalhe<{ pedido: PedidoDetalhe }>(api, `${BASE}/pedidos/${id}`, versao)
  const { ocupado, erro: erroAcao, executar } = useExecutar()
  const p = dados?.pedido

  async function acao(nome: "emitir" | "cancelar", ok: string) {
    const res = await executar(() => api.enviar(`${BASE}/pedidos/${id}/acao`, "POST", { acao: nome }), ok)
    if (res) { setVersao((v) => v + 1); onMudou() }
  }
  const compraAtiva = p?.compra && p.compra.status !== "CANCELADA"

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{p ? `Pedido ${p.numero}` : "Pedido de compra"}</DialogTitle>
          <DialogDescription>Itens com quantidade pedida, recebida e pendente.</DialogDescription>
        </DialogHeader>
        {carregando && <Skeleton role="status" aria-label="Carregando" className="h-40 w-full" />}
        {erro && <Alert variant="destructive" role="alert"><AlertDescription>{erro}</AlertDescription></Alert>}
        {p && (
          <>
            <Fluxo passos={[
              { rotulo: "Solicitação", valor: p.requisicao?.numero ?? null },
              { rotulo: "Pedido", valor: p.numero, atual: true },
              { rotulo: "Compra", valor: p.compra?.codigo ?? null },
              { rotulo: "Nota fiscal", valor: p.notasFiscais ? `${p.notasFiscais} registrada(s)` : null },
            ]} />
            <dl className="grid gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Status</dt><dd><BadgeStatus tipo="pedido" status={p.status} /></dd></div>
              <div><dt className="text-muted-foreground">Data</dt><dd>{data(p.dataPedido)}</dd></div>
              <div><dt className="text-muted-foreground">Fornecedor</dt><dd>{p.fornecedor.nome}</dd></div>
              <div><dt className="text-muted-foreground">Responsável</dt><dd>{p.responsavel.nome}</dd></div>
            </dl>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Insumo</TableHead><TableHead className="text-right">Pedida</TableHead>
                  <TableHead className="text-right">Recebida</TableHead><TableHead className="text-right">Pendente</TableHead>
                  <TableHead className="text-right">Valor unit.</TableHead><TableHead className="text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {p.itens.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell><div className="font-medium">{i.nome}</div><div className="font-mono text-xs text-muted-foreground">{i.codigo}</div></TableCell>
                      <TableCell className="text-right tabular-nums">{quantidade(i.quantidadePedida)} {i.unidade}</TableCell>
                      <TableCell className="text-right tabular-nums">{quantidade(i.quantidadeRecebida)}</TableCell>
                      <TableCell className="text-right tabular-nums">{quantidade(i.quantidadePendente)}</TableCell>
                      <TableCell className="text-right tabular-nums">{moeda(i.valorUnitario)}</TableCell>
                      <TableCell className="text-right tabular-nums">{moeda(i.valorTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-right text-sm">Total: <strong className="tabular-nums">{moeda(p.valorTotal)}</strong></p>
            {p.observacao && <p className="text-sm"><span className="text-muted-foreground">Observações: </span>{p.observacao}</p>}
            {erroAcao && <Alert variant="destructive" role="alert"><AlertDescription>{erroAcao}</AlertDescription></Alert>}
            <DialogFooter>
              {podeEditar && (p.status === "RASCUNHO" || (p.status === "EMITIDO" && !compraAtiva && (!p.compra || p.compra.status === "CANCELADA"))) && (
                <Button variant="outline" disabled={ocupado} onClick={() => setCancelando(true)}>Cancelar pedido</Button>
              )}
              {podeEditar && p.status === "RASCUNHO" && (<>
                <Button variant="secondary" disabled={ocupado} onClick={() => onEditar(p)}>Editar</Button>
                <Button disabled={ocupado} onClick={() => void acao("emitir", "Pedido emitido.")}>Emitir pedido</Button>
              </>)}
              {podeCriar && p.status === "EMITIDO" && !p.compra && (
                <Button disabled={ocupado} onClick={() => onGerarCompra(p)}>Gerar compra</Button>
              )}
            </DialogFooter>
            <ConfirmarAcao aberto={cancelando} destrutivo titulo={`Cancelar ${p.numero}?`}
              descricao={p.requisicao ? `O pedido será cancelado e a solicitação ${p.requisicao.numero} voltará a ficar aprovada.` : "O pedido será cancelado. Esta ação não pode ser desfeita."}
              rotuloConfirmar="Cancelar pedido" onFechar={() => setCancelando(false)}
              onConfirmar={() => { setCancelando(false); void acao("cancelar", "Pedido cancelado.") }} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

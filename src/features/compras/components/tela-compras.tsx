"use client"
import { useState } from "react"
import { PackageCheck, Plus } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { BASE, type ComprasApi } from "../api"
import { useExecutar } from "../executar"
import type { Compra, CompraDetalhe, Lista, ResumoStatus } from "../tipos"
import { useAtraso, useDetalhe, useLista } from "../use-lista"
import { ShellCompras } from "../shell"
import {
  BadgeStatus, BarraFiltros, CartoesResumo, ConfirmarAcao, data, EstadoLista, filtrosVazios, Fluxo, moeda, Paginador,
  quantidade, rotulosStatus, type Filtros,
} from "./comuns"
import { DialogoCompra, DialogoReceber } from "./dialogo-compra"
import { DialogoNota } from "./dialogo-nota"

type Resposta = Lista<"compras", Compra, ResumoStatus & { valorTotal: string }>

export function TelaCompras() {
  return (
    <ShellCompras titulo="Compras" descricao="Compras realizadas e seu recebimento, vinculadas ao pedido de compra.">
      {(api) => <Conteudo api={api} />}
    </ShellCompras>
  )
}

function Conteudo({ api }: { api: ComprasApi }) {
  const [filtros, setFiltros] = useState<Filtros>(filtrosVazios)
  const [pagina, setPagina] = useState(1)
  const [aberto, setAberto] = useState<number | null>(null)
  const [dialogo, setDialogo] = useState<"nova" | { receber: CompraDetalhe } | { nota: CompraDetalhe } | null>(null)
  const busca = useAtraso(filtros.busca.trim())
  const { dados, erro, carregando, recarregar } = useLista<Resposta>(
    api, `${BASE}/compras`, { busca, status: filtros.status, de: filtros.de, ate: filtros.ate }, pagina,
  )
  const s = dados?.resumo.porStatus ?? {}
  const total = Object.values(s).reduce((a, b) => a + b, 0)
  const filtrado = Boolean(filtros.busca || filtros.status || filtros.de || filtros.ate)

  return (
    <>
      {dados && total > 0 && (
        <CartoesResumo itens={[
          { rotulo: "Aguardando recebimento", valor: s.EMITIDA ?? 0 },
          { rotulo: "Compras recebidas", valor: s.ENTREGUE ?? 0 },
          { rotulo: "Valor total das compras", valor: moeda(dados.resumo.valorTotal) },
        ]} />
      )}
      <BarraFiltros valor={filtros} onChange={(f) => { setFiltros(f); setPagina(1) }} status={rotulosStatus("compra")}
        placeholderBusca="Buscar por compra, pedido ou fornecedor" rotuloPeriodo="Emissão"
        acao={dados?.permissoes.criar ? <Button onClick={() => setDialogo("nova")}><Plus /> Nova compra</Button> : undefined} />
      <EstadoLista carregando={carregando} erro={erro} vazio={!dados?.compras.length} filtrado={filtrado} onRecarregar={recarregar}
        icone={<PackageCheck />} tituloVazio="Nenhuma compra registrada" descricaoVazio="Gere uma compra a partir de um pedido emitido.">
        {dados && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Compra</TableHead><TableHead>Emissão</TableHead><TableHead>Fornecedor</TableHead>
                  <TableHead>Pedido</TableHead><TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">NFs</TableHead><TableHead>Status</TableHead>
                  <TableHead className="w-20"><span className="sr-only">Ações</span></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {dados.compras.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono">{c.codigo}</TableCell>
                      <TableCell>{data(c.dataEmissao)}</TableCell>
                      <TableCell>{c.fornecedor.nome}</TableCell>
                      <TableCell className="font-mono text-xs">{c.pedido?.numero ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{moeda(c.valorTotal)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.notasFiscais}</TableCell>
                      <TableCell><BadgeStatus tipo="compra" status={c.status} /></TableCell>
                      <TableCell><Button variant="outline" size="sm" onClick={() => setAberto(c.id)} aria-label={`Ver ${c.codigo}`}>Ver</Button></TableCell>
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
          onReceber={(c) => { setAberto(null); setDialogo({ receber: c }) }}
          onNota={(c) => { setAberto(null); setDialogo({ nota: c }) }} />
      )}
      {dialogo === "nova" && <DialogoCompra api={api} onFechar={() => setDialogo(null)} onSalvo={recarregar} />}
      {dialogo && typeof dialogo === "object" && "receber" in dialogo && (
        <DialogoReceber api={api} compra={dialogo.receber} onFechar={() => setDialogo(null)} onSalvo={recarregar} />
      )}
      {dialogo && typeof dialogo === "object" && "nota" in dialogo && (
        <DialogoNota api={api} compra={{ id: dialogo.nota.id, codigo: dialogo.nota.codigo, fornecedor: { id: dialogo.nota.fornecedor.id, nome: dialogo.nota.fornecedor.nome }, valorTotal: dialogo.nota.valorTotal }}
          onFechar={() => setDialogo(null)} onSalvo={recarregar} />
      )}
    </>
  )
}

function Detalhe({
  api, id, podeEditar, podeCriar, onFechar, onMudou, onReceber, onNota,
}: {
  api: ComprasApi; id: number; podeEditar: boolean; podeCriar: boolean; onFechar: () => void; onMudou: () => void
  onReceber: (c: CompraDetalhe) => void; onNota: (c: CompraDetalhe) => void
}) {
  const [versao, setVersao] = useState(0)
  const [cancelando, setCancelando] = useState(false)
  const { dados, erro, carregando } = useDetalhe<{ compra: CompraDetalhe }>(api, `${BASE}/compras/${id}`, versao)
  const { ocupado, erro: erroAcao, executar } = useExecutar()
  const c = dados?.compra

  async function cancelar() {
    const res = await executar(() => api.enviar(`${BASE}/compras/${id}/acao`, "POST", { acao: "cancelar" }), "Compra cancelada.")
    if (res) { setVersao((v) => v + 1); onMudou() }
  }
  const notasAtivas = c?.notas.filter((n) => n.status !== "CANCELADA") ?? []

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{c ? `Compra ${c.codigo}` : "Compra"}</DialogTitle>
          <DialogDescription>Quantidades pedida, recebida e pendente por item.</DialogDescription>
        </DialogHeader>
        {carregando && <Skeleton role="status" aria-label="Carregando" className="h-40 w-full" />}
        {erro && <Alert variant="destructive" role="alert"><AlertDescription>{erro}</AlertDescription></Alert>}
        {c && (
          <>
            <Fluxo passos={[
              { rotulo: "Pedido", valor: c.pedido?.numero ?? null },
              { rotulo: "Compra", valor: c.codigo, atual: true },
              { rotulo: "Nota fiscal", valor: notasAtivas.length ? notasAtivas.map((n) => n.numero).join(", ") : null },
            ]} />
            <dl className="grid gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-muted-foreground">Status</dt><dd><BadgeStatus tipo="compra" status={c.status} /></dd></div>
              <div><dt className="text-muted-foreground">Emissão</dt><dd>{data(c.dataEmissao)}</dd></div>
              <div><dt className="text-muted-foreground">Fornecedor</dt><dd>{c.fornecedor.nome}</dd></div>
              <div><dt className="text-muted-foreground">Local de destino</dt><dd>{c.local.nome}</dd></div>
              <div><dt className="text-muted-foreground">Responsável</dt><dd>{c.responsavel.nome}</dd></div>
              {c.status === "ENTREGUE" && <div><dt className="text-muted-foreground">Recebida em</dt><dd>{data(c.dataAtualizacao)}</dd></div>}
            </dl>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Insumo</TableHead><TableHead className="text-right">Pedida</TableHead>
                  <TableHead className="text-right">Recebida</TableHead><TableHead className="text-right">Pendente</TableHead>
                  <TableHead className="text-right">Valor unit.</TableHead><TableHead className="text-right">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {c.itens.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell><div className="font-medium">{i.nome}</div><div className="font-mono text-xs text-muted-foreground">{i.codigo}</div></TableCell>
                      <TableCell className="text-right tabular-nums">{i.quantidadePedida ? `${quantidade(i.quantidadePedida)} ${i.unidade}` : `${quantidade(i.quantidade)} ${i.unidade}`}</TableCell>
                      <TableCell className="text-right tabular-nums">{quantidade(i.quantidadeRecebida)}</TableCell>
                      <TableCell className="text-right tabular-nums">{i.quantidadePendente === null ? "—" : quantidade(i.quantidadePendente)}</TableCell>
                      <TableCell className="text-right tabular-nums">{moeda(i.valorUnitario)}</TableCell>
                      <TableCell className="text-right tabular-nums">{moeda(i.valorTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-right text-sm">Total: <strong className="tabular-nums">{moeda(c.valorTotal)}</strong></p>
            {c.notas.length > 0 && (
              <p className="text-sm"><span className="text-muted-foreground">Notas fiscais: </span>
                {c.notas.map((n) => `${n.numero}/${n.serie}`).join(", ")}</p>
            )}
            {c.observacao && <p className="text-sm"><span className="text-muted-foreground">Observações: </span>{c.observacao}</p>}
            {erroAcao && <Alert variant="destructive" role="alert"><AlertDescription>{erroAcao}</AlertDescription></Alert>}
            <DialogFooter>
              {podeEditar && ["RASCUNHO", "EMITIDA"].includes(c.status) && (
                <Button variant="outline" disabled={ocupado} onClick={() => setCancelando(true)}>Cancelar compra</Button>
              )}
              {podeCriar && c.status !== "CANCELADA" && (
                <Button variant="secondary" disabled={ocupado} onClick={() => onNota(c)}>Registrar nota fiscal</Button>
              )}
              {podeEditar && c.status === "EMITIDA" && (
                <Button disabled={ocupado} onClick={() => onReceber(c)}>Registrar recebimento</Button>
              )}
            </DialogFooter>
            <ConfirmarAcao aberto={cancelando} destrutivo titulo={`Cancelar ${c.codigo}?`}
              descricao="A compra será cancelada. O pedido vinculado permanece emitido e deverá ser cancelado separadamente, se necessário."
              rotuloConfirmar="Cancelar compra" onFechar={() => setCancelando(false)}
              onConfirmar={() => { setCancelando(false); void cancelar() }} />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

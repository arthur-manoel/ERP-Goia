"use client"
import { useState } from "react"
import { FileText, Plus } from "lucide-react"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BASE, type ComprasApi } from "../api"
import { useExecutar } from "../executar"
import type { Lista, Nota, ResumoStatus } from "../tipos"
import { useAtraso, useDetalhe, useLista } from "../use-lista"
import { ShellCompras } from "../shell"
import {
  BadgeStatus,
  BarraFiltros,
  CartoesResumo,
  ConfirmarAcao,
  data,
  EstadoLista,
  filtrosVazios,
  Fluxo,
  moeda,
  Paginador,
  rotulosStatus,
  type Filtros,
} from "./comuns"
import { DialogoNota } from "./dialogo-nota"

type Resposta = Lista<"notas", Nota, ResumoStatus & { valorTotal: string }>

export function TelaNotas() {
  return (
    <ShellCompras
      titulo="Notas fiscais"
      descricao="Registro e controle das notas fiscais de compra. Sem integração com a SEFAZ."
    >
      {(api) => <Conteudo api={api} />}
    </ShellCompras>
  )
}

function Conteudo({ api }: { api: ComprasApi }) {
  const [filtros, setFiltros] = useState<Filtros>(filtrosVazios)
  const [pagina, setPagina] = useState(1)
  const [aberto, setAberto] = useState<number | null>(null)
  const [dialogo, setDialogo] = useState<"nova" | { editar: Nota } | null>(null)
  const busca = useAtraso(filtros.busca.trim())
  const { dados, erro, carregando, recarregar } = useLista<Resposta>(
    api,
    `${BASE}/notas-fiscais`,
    { busca, status: filtros.status, de: filtros.de, ate: filtros.ate },
    pagina,
  )
  const s = dados?.resumo.porStatus ?? {}
  const total = Object.values(s).reduce((a, b) => a + b, 0)
  const filtrado = Boolean(
    filtros.busca || filtros.status || filtros.de || filtros.ate,
  )

  return (
    <>
      {dados && total > 0 && (
        <CartoesResumo
          itens={[
            { rotulo: "Notas pendentes", valor: s.PENDENTE ?? 0 },
            { rotulo: "Notas recebidas", valor: s.RECEBIDA ?? 0 },
            {
              rotulo: "Valor total registrado",
              valor: moeda(dados.resumo.valorTotal),
            },
          ]}
        />
      )}
      <BarraFiltros
        valor={filtros}
        onChange={(f) => {
          setFiltros(f)
          setPagina(1)
        }}
        status={rotulosStatus("nota")}
        placeholderBusca="Buscar por número, chave ou fornecedor"
        rotuloPeriodo="Emissão"
        acao={
          dados?.permissoes.criar ? (
            <Button onClick={() => setDialogo("nova")}>
              <Plus /> Registrar nota
            </Button>
          ) : undefined
        }
      />
      <EstadoLista
        carregando={carregando}
        erro={erro}
        vazio={!dados?.notas.length}
        filtrado={filtrado}
        onRecarregar={recarregar}
        icone={<FileText />}
        tituloVazio="Nenhuma nota fiscal registrada"
        descricaoVazio="Registre a nota fiscal de uma compra recebida."
      >
        {dados && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número / Série</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Emissão</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead>Compra</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-20">
                      <span className="sr-only">Ações</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dados.notas.map((n) => (
                    <TableRow key={n.id}>
                      <TableCell className="font-mono">
                        {n.numero}/{n.serie}
                      </TableCell>
                      <TableCell>{n.fornecedor.nome}</TableCell>
                      <TableCell>{data(n.dataEmissao)}</TableCell>
                      <TableCell>{data(n.dataRecebimento)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {n.compra?.codigo ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {moeda(n.valorTotal)}
                      </TableCell>
                      <TableCell>
                        <BadgeStatus tipo="nota" status={n.status} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAberto(n.id)}
                          aria-label={`Ver NF ${n.numero}`}
                        >
                          Ver
                        </Button>
                      </TableCell>
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
        <Detalhe
          api={api}
          id={aberto}
          podeEditar={dados?.permissoes.editar ?? false}
          onFechar={() => setAberto(null)}
          onMudou={recarregar}
          onEditar={(n) => {
            setAberto(null)
            setDialogo({ editar: n })
          }}
        />
      )}
      {dialogo === "nova" && (
        <DialogoNota
          api={api}
          onFechar={() => setDialogo(null)}
          onSalvo={recarregar}
        />
      )}
      {dialogo && typeof dialogo === "object" && (
        <DialogoNota
          api={api}
          existente={dialogo.editar}
          onFechar={() => setDialogo(null)}
          onSalvo={recarregar}
        />
      )}
    </>
  )
}

function Detalhe({
  api,
  id,
  podeEditar,
  onFechar,
  onMudou,
  onEditar,
}: {
  api: ComprasApi
  id: number
  podeEditar: boolean
  onFechar: () => void
  onMudou: () => void
  onEditar: (n: Nota) => void
}) {
  const [versao, setVersao] = useState(0)
  const [cancelando, setCancelando] = useState(false)
  const { dados, erro, carregando } = useDetalhe<{ nota: Nota }>(
    api,
    `${BASE}/notas-fiscais/${id}`,
    versao,
  )
  const { ocupado, erro: erroAcao, executar } = useExecutar()
  const n = dados?.nota

  async function acao(nome: "receber" | "cancelar", ok: string) {
    const res = await executar(
      () =>
        api.enviar(`${BASE}/notas-fiscais/${id}/acao`, "POST", { acao: nome }),
      ok,
    )
    if (res) {
      setVersao((v) => v + 1)
      onMudou()
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {n ? `NF ${n.numero} / série ${n.serie}` : "Nota fiscal"}
          </DialogTitle>
          <DialogDescription>
            Registro da nota fiscal de compra.
          </DialogDescription>
        </DialogHeader>
        {carregando && (
          <Skeleton
            role="status"
            aria-label="Carregando"
            className="h-40 w-full"
          />
        )}
        {erro && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        {n && (
          <>
            <Fluxo
              passos={[
                { rotulo: "Pedido", valor: n.pedido?.numero ?? null },
                { rotulo: "Compra", valor: n.compra?.codigo ?? null },
                { rotulo: "Nota fiscal", valor: n.numero, atual: true },
              ]}
            />
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <BadgeStatus tipo="nota" status={n.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fornecedor</dt>
                <dd>{n.fornecedor.nome}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Valor total</dt>
                <dd className="tabular-nums">{moeda(n.valorTotal)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Emissão</dt>
                <dd>{data(n.dataEmissao)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Entrada</dt>
                <dd>{data(n.dataRecebimento)}</dd>
              </div>
            </dl>
            <div className="text-sm">
              <span className="text-muted-foreground">Chave de acesso</span>
              <p className="font-mono break-all">{n.chaveAcesso}</p>
            </div>
            {n.observacao && (
              <p className="text-sm">
                <span className="text-muted-foreground">Observações: </span>
                {n.observacao}
              </p>
            )}
            {erroAcao && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{erroAcao}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              {podeEditar &&
                n.status !== "CANCELADA" &&
                !n.entradaProcessada && (
                  <Button
                    variant="outline"
                    disabled={ocupado}
                    onClick={() => setCancelando(true)}
                  >
                    Cancelar nota
                  </Button>
                )}
              {podeEditar && n.status === "PENDENTE" && (
                <>
                  <Button
                    variant="secondary"
                    disabled={ocupado}
                    onClick={() => onEditar(n)}
                  >
                    Editar
                  </Button>
                  <Button
                    disabled={ocupado}
                    onClick={() =>
                      void acao("receber", "Nota marcada como recebida.")
                    }
                  >
                    Marcar como recebida
                  </Button>
                </>
              )}
            </DialogFooter>
            <ConfirmarAcao
              aberto={cancelando}
              destrutivo
              titulo={`Cancelar NF ${n.numero}?`}
              descricao="A nota será marcada como cancelada no ERP (não afeta a SEFAZ)."
              rotuloConfirmar="Cancelar nota"
              onFechar={() => setCancelando(false)}
              onConfirmar={() => {
                setCancelando(false)
                void acao("cancelar", "Nota cancelada.")
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

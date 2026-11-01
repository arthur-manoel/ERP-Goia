"use client"
import { useMemo, useState } from "react"
import { ClipboardList, Plus } from "lucide-react"
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
import { BarraFiltros } from "@/components/listagem/barra-filtros"
import { Listagem } from "@/components/listagem/listagem"
import { useListagem } from "@/hooks/use-listagem"
import {
  criarFonteServidor,
  nomesPaginacao,
  normalizarPaginacao,
} from "@/lib/listagem/contratos"
import { BASE, type ComprasApi } from "../api"
import { useExecutar } from "../executar"
import type {
  Lista,
  Requisicao,
  RequisicaoDetalhe,
  ResumoStatus,
} from "../tipos"
import { useDetalhe } from "../use-lista"
import { ShellCompras } from "../shell"
import {
  BadgeStatus,
  CartoesResumo,
  ConfirmarAcao,
  data,
  Fluxo,
  quantidade,
  rotulosStatus,
} from "./comuns"
import { DialogoPedido, type PedidoInicial } from "./dialogo-pedido"
import { DialogoRequisicao } from "./dialogo-requisicao"

type Resposta = Lista<"requisicoes", Requisicao, ResumoStatus>

export function TelaRequisicoes() {
  return (
    <ShellCompras
      titulo="Solicitações de compra"
      descricao="Primeira etapa: peça insumos e materiais. Solicitações não alteram o estoque."
    >
      {(api) => <Conteudo api={api} />}
    </ShellCompras>
  )
}

function Conteudo({ api }: { api: ComprasApi }) {
  const [aberto, setAberto] = useState<number | null>(null)
  const [dialogo, setDialogo] = useState<
    "nova" | { editar: RequisicaoDetalhe } | { pedido: PedidoInicial } | null
  >(null)
  const fonte = useMemo(
    () =>
      criarFonteServidor<Requisicao, Resposta>({
        obter: (url) => api.get<unknown>(url),
        rota: `${BASE}/requisicoes`,
        nomes: nomesPaginacao,
        normalizar: (corpo) =>
          normalizarPaginacao<Requisicao, Resposta>(corpo, "requisicoes"),
      }),
    [api],
  )
  const listagem = useListagem({ fonte })
  const { recarregar } = listagem
  // Corpo completo da resposta: traz também o resumo por status e as permissões.
  const dados = listagem.meta
  const s = dados?.resumo.porStatus ?? {}
  const total = Object.values(s).reduce((a, b) => a + b, 0)
  const resumo = dados
    ? [
        { rotulo: "Solicitações pendentes", valor: s.ABERTA ?? 0 },
        { rotulo: "Aprovadas (aguardando pedido)", valor: s.APROVADA ?? 0 },
        { rotulo: "Em rascunho", valor: s.RASCUNHO ?? 0 },
        { rotulo: "Convertidas em pedido", valor: s.ATENDIDA ?? 0 },
      ]
    : null

  return (
    <>
      {resumo && total > 0 && <CartoesResumo itens={resumo} />}
      <BarraFiltros
        listagem={listagem}
        placeholderBusca="Buscar por número ou solicitante"
        campos={[
          {
            tipo: "selecao",
            chave: "status",
            rotulo: "Filtrar por status",
            opcaoTodos: "Todos os status",
            opcoes: rotulosStatus("requisicao"),
          },
          {
            tipo: "periodo",
            chaveDe: "de",
            chaveAte: "ate",
            rotulo: "Período",
          },
        ]}
        acao={
          dados?.permissoes.criar ? (
            <Button onClick={() => setDialogo("nova")}>
              <Plus /> Nova solicitação
            </Button>
          ) : undefined
        }
      />
      <Listagem
        listagem={listagem}
        rotulo="Solicitações de compra"
        substantivo={{ singular: "solicitação", plural: "solicitações" }}
        chaveItem={(r) => r.id}
        vazio={{
          icone: <ClipboardList />,
          titulo: "Nenhuma solicitação de compra",
          descricao:
            "Crie a primeira solicitação para iniciar o fluxo de compras.",
        }}
        colunas={[
          {
            id: "numero",
            cabecalho: "Número",
            className: "font-mono",
            celula: (r) => r.numero,
          },
          {
            id: "data",
            cabecalho: "Data",
            celula: (r) => data(r.dataSolicitacao),
          },
          {
            id: "solicitante",
            cabecalho: "Solicitante",
            celula: (r) => r.solicitante.nome,
          },
          { id: "setor", cabecalho: "Setor", celula: (r) => r.setor ?? "—" },
          {
            id: "itens",
            cabecalho: "Itens",
            className: "text-right tabular-nums",
            celula: (r) => r.totalItens,
          },
          {
            id: "status",
            cabecalho: "Status",
            celula: (r) => <BadgeStatus tipo="requisicao" status={r.status} />,
          },
          {
            id: "ver",
            cabecalho: <span className="sr-only">Ações</span>,
            className: "w-20",
            celula: (r) => (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAberto(r.id)}
                aria-label={`Ver ${r.numero}`}
              >
                Ver
              </Button>
            ),
          },
        ]}
      />

      {aberto !== null && (
        <Detalhe
          api={api}
          id={aberto}
          podeEditar={dados?.permissoes.editar ?? false}
          podeCriar={dados?.permissoes.criar ?? false}
          onFechar={() => setAberto(null)}
          onMudou={recarregar}
          onEditar={(r) => {
            setAberto(null)
            setDialogo({ editar: r })
          }}
          onGerarPedido={(p) => {
            setAberto(null)
            setDialogo({ pedido: p })
          }}
        />
      )}
      {dialogo === "nova" && (
        <DialogoRequisicao
          api={api}
          onFechar={() => setDialogo(null)}
          onSalvo={recarregar}
        />
      )}
      {dialogo && typeof dialogo === "object" && "editar" in dialogo && (
        <DialogoRequisicao
          api={api}
          existente={dialogo.editar}
          onFechar={() => setDialogo(null)}
          onSalvo={recarregar}
        />
      )}
      {dialogo && typeof dialogo === "object" && "pedido" in dialogo && (
        <DialogoPedido
          api={api}
          inicial={dialogo.pedido}
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
  podeCriar,
  onFechar,
  onMudou,
  onEditar,
  onGerarPedido,
}: {
  api: ComprasApi
  id: number
  podeEditar: boolean
  podeCriar: boolean
  onFechar: () => void
  onMudou: () => void
  onEditar: (r: RequisicaoDetalhe) => void
  onGerarPedido: (p: PedidoInicial) => void
}) {
  const [versao, setVersao] = useState(0)
  const [cancelando, setCancelando] = useState(false)
  const { dados, erro, carregando } = useDetalhe<{
    requisicao: RequisicaoDetalhe
  }>(api, `${BASE}/requisicoes/${id}`, versao)
  const { ocupado, erro: erroAcao, executar } = useExecutar()
  const r = dados?.requisicao

  async function acao(nome: "enviar" | "aprovar" | "cancelar", ok: string) {
    const res = await executar(
      () =>
        api.enviar(`${BASE}/requisicoes/${id}/acao`, "POST", { acao: nome }),
      ok,
    )
    if (res) {
      setVersao((v) => v + 1)
      onMudou()
    }
  }
  const pedidoAtivo = r?.pedidos.find((p) => p.status !== "CANCELADO")

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {r ? `Solicitação ${r.numero}` : "Solicitação de compra"}
          </DialogTitle>
          <DialogDescription>
            Detalhes e ações disponíveis para o status atual.
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
        {r && (
          <>
            <Fluxo
              passos={[
                { rotulo: "Solicitação", valor: r.numero, atual: true },
                { rotulo: "Pedido", valor: pedidoAtivo?.numero ?? null },
                { rotulo: "Compra", valor: null },
                { rotulo: "Nota fiscal", valor: null },
              ]}
            />
            <dl className="grid gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <BadgeStatus tipo="requisicao" status={r.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Data</dt>
                <dd>{data(r.dataSolicitacao)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Solicitante</dt>
                <dd>{r.solicitante.nome}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Setor / Local</dt>
                <dd>{[r.setor, r.local].filter(Boolean).join(" / ") || "—"}</dd>
              </div>
            </dl>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Unidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.itens.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <div className="font-medium">{i.nome}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {i.codigo}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {quantidade(i.quantidade)}
                      </TableCell>
                      <TableCell>{i.unidade}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {r.observacao && (
              <p className="text-sm">
                <span className="text-muted-foreground">Observações: </span>
                {r.observacao}
              </p>
            )}
            {erroAcao && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{erroAcao}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              {podeEditar &&
                ["RASCUNHO", "ABERTA", "APROVADA"].includes(r.status) && (
                  <Button
                    variant="outline"
                    disabled={ocupado}
                    onClick={() => setCancelando(true)}
                  >
                    {r.status === "ABERTA"
                      ? "Rejeitar / cancelar"
                      : "Cancelar solicitação"}
                  </Button>
                )}
              {podeEditar && r.status === "RASCUNHO" && (
                <>
                  <Button
                    variant="secondary"
                    disabled={ocupado}
                    onClick={() => onEditar(r)}
                  >
                    Editar
                  </Button>
                  <Button
                    disabled={ocupado}
                    onClick={() => void acao("enviar", "Solicitação enviada.")}
                  >
                    Enviar para análise
                  </Button>
                </>
              )}
              {podeEditar && r.status === "ABERTA" && (
                <Button
                  disabled={ocupado}
                  onClick={() => void acao("aprovar", "Solicitação aprovada.")}
                >
                  Aprovar
                </Button>
              )}
              {podeCriar && r.status === "APROVADA" && (
                <Button
                  disabled={ocupado}
                  onClick={() =>
                    onGerarPedido({
                      idRequisicaoCompra: r.id,
                      numero: r.numero,
                      observacao: r.observacao,
                      itens: r.itens.map((i) => ({
                        idProduto: i.idProduto,
                        codigo: i.codigo,
                        nome: i.nome,
                        unidade: i.unidade,
                        quantidade: String(Number(i.quantidade)),
                        valorUnitario: "",
                      })),
                    })
                  }
                >
                  Gerar pedido de compra
                </Button>
              )}
            </DialogFooter>
            <ConfirmarAcao
              aberto={cancelando}
              destrutivo
              titulo={`Cancelar ${r.numero}?`}
              descricao="A solicitação será encerrada como cancelada. Esta ação não pode ser desfeita."
              rotuloConfirmar="Cancelar solicitação"
              onFechar={() => setCancelando(false)}
              onConfirmar={() => {
                setCancelando(false)
                void acao("cancelar", "Solicitação cancelada.")
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

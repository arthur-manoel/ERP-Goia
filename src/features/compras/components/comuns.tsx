"use client"
import { useEffect, useRef, useState } from "react"
import { ChevronRight, Plus, Search, Trash2, X } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatarMoeda } from "@/lib/formatacao"
import {
  quantidadeValida,
  somarValores,
  totalItem,
  valorValido,
} from "@/modules/compras/compras.regras"
import { mensagem, BASE, type ComprasApi } from "../api"
import { useAtraso } from "../use-lista"
import type { Opcao, PaginacaoApi } from "../tipos"

// ------------------------------------------------------------------ formatação
export const moeda = (v: string) => formatarMoeda(v)
export const data = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(iso))
    : "—"
/** Quantidade sem zeros à direita inúteis: "100.000" → "100", "2.500" → "2,5". */
export const quantidade = (v: string) =>
  Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 3 })
/** Aceita vírgula decimal ("1,5"). Não tenta adivinhar separador de milhar. */
export const numero = (texto: string) => {
  const t = texto.trim()
  return t.includes(",") && !t.includes(".") ? t.replace(",", ".") : t
}
export const dinheiro2 = (texto: string) =>
  valorValido(numero(texto)) ? numero(texto) : null

// ---------------------------------------------------------------------- status
type Variante = "default" | "secondary" | "destructive" | "outline"
const mapas = {
  requisicao: {
    RASCUNHO: ["Rascunho", "outline"],
    ABERTA: ["Solicitada", "secondary"],
    APROVADA: ["Aprovada", "default"],
    ATENDIDA: ["Convertida em pedido", "default"],
    CANCELADA: ["Cancelada", "destructive"],
  },
  pedido: {
    RASCUNHO: ["Rascunho", "outline"],
    EMITIDO: ["Emitido", "secondary"],
    PARCIAL: ["Recebido parcialmente", "secondary"],
    RECEBIDO: ["Recebido", "default"],
    CANCELADO: ["Cancelado", "destructive"],
  },
  compra: {
    RASCUNHO: ["Rascunho", "outline"],
    EMITIDA: ["Aguardando recebimento", "secondary"],
    ENTREGUE: ["Recebida", "default"],
    CANCELADA: ["Cancelada", "destructive"],
  },
  nota: {
    PENDENTE: ["Pendente", "secondary"],
    RECEBIDA: ["Recebida", "default"],
    CANCELADA: ["Cancelada", "destructive"],
  },
} as const satisfies Record<string, Record<string, readonly [string, Variante]>>

export function rotulosStatus(tipo: keyof typeof mapas) {
  return Object.entries(mapas[tipo]).map(([valor, [rotulo]]) => ({
    valor,
    rotulo,
  }))
}
export function BadgeStatus({
  tipo,
  status,
}: {
  tipo: keyof typeof mapas
  status: string
}) {
  const [rotulo, variante] = (
    mapas[tipo] as Record<string, readonly [string, Variante]>
  )[status] ?? [status, "outline"]
  return <Badge variant={variante}>{rotulo}</Badge>
}

// ----------------------------------------------------------- layout de listagem
export function CartoesResumo({
  itens,
}: {
  itens: Array<{ rotulo: string; valor: string | number }>
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {itens.map((item) => (
        <Card key={item.rotulo}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {item.rotulo}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">
            {item.valor}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export type Filtros = { busca: string; status: string; de: string; ate: string }
export const filtrosVazios: Filtros = { busca: "", status: "", de: "", ate: "" }

export function BarraFiltros({
  valor,
  onChange,
  status,
  placeholderBusca,
  rotuloPeriodo = "Período",
  acao,
}: {
  valor: Filtros
  onChange: (f: Filtros) => void
  status: Array<{ valor: string; rotulo: string }>
  placeholderBusca: string
  rotuloPeriodo?: string
  acao?: React.ReactNode
}) {
  const alterados = valor.busca || valor.status || valor.de || valor.ate
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input
          aria-label="Buscar"
          className="pl-9"
          placeholder={placeholderBusca}
          value={valor.busca}
          onChange={(e) => onChange({ ...valor, busca: e.target.value })}
        />
      </div>
      <NativeSelect
        aria-label="Filtrar por status"
        value={valor.status}
        onChange={(e) => onChange({ ...valor, status: e.target.value })}
      >
        <NativeSelectOption value="">Todos os status</NativeSelectOption>
        {status.map((s) => (
          <NativeSelectOption key={s.valor} value={s.valor}>
            {s.rotulo}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground" htmlFor="filtro-de">
          {rotuloPeriodo}
        </Label>
        <Input
          id="filtro-de"
          type="date"
          className="w-40"
          value={valor.de}
          max={valor.ate || undefined}
          onChange={(e) => onChange({ ...valor, de: e.target.value })}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          aria-label={`${rotuloPeriodo} final`}
          type="date"
          className="w-40"
          value={valor.ate}
          min={valor.de || undefined}
          onChange={(e) => onChange({ ...valor, ate: e.target.value })}
        />
      </div>
      {alterados ? (
        <Button variant="ghost" onClick={() => onChange(filtrosVazios)}>
          <X /> Limpar
        </Button>
      ) : null}
      {acao ? <div className="ml-auto">{acao}</div> : null}
    </div>
  )
}

export function Paginador({
  p,
  onPagina,
}: {
  p: PaginacaoApi
  onPagina: (n: number) => void
}) {
  if (p.totalPaginas <= 1)
    return (
      <p className="text-sm text-muted-foreground">{p.total} registro(s)</p>
    )
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{p.total} registro(s)</span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={p.pagina <= 1}
          onClick={() => onPagina(p.pagina - 1)}
        >
          Anterior
        </Button>
        <span className="tabular-nums">
          Página {p.pagina} de {p.totalPaginas}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={p.pagina >= p.totalPaginas}
          onClick={() => onPagina(p.pagina + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  )
}

/** Estados de carregando/erro/vazio de uma listagem; renderiza `children` (a tabela) quando há dados. */
export function EstadoLista({
  carregando,
  erro,
  vazio,
  filtrado,
  onRecarregar,
  icone,
  tituloVazio,
  descricaoVazio,
  children,
}: {
  carregando: boolean
  erro: string
  vazio: boolean
  filtrado: boolean
  onRecarregar: () => void
  icone: React.ReactNode
  tituloVazio: string
  descricaoVazio: string
  children: React.ReactNode
}) {
  if (erro)
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription className="space-y-3">
          <p>{erro}</p>
          <Button variant="outline" onClick={onRecarregar}>
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    )
  if (carregando && vazio)
    return (
      <Skeleton role="status" aria-label="Carregando" className="h-64 w-full" />
    )
  if (vazio)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">{icone}</EmptyMedia>
          <EmptyTitle>{filtrado ? "Nenhum resultado" : tituloVazio}</EmptyTitle>
          <EmptyDescription>
            {filtrado ? "Ajuste a busca ou os filtros." : descricaoVazio}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  return (
    <div className={carregando ? "opacity-60 transition-opacity" : undefined}>
      {children}
    </div>
  )
}

// ----------------------------------------------------------------- formulário
export function Campo({
  rotulo,
  children,
  ajuda,
}: {
  rotulo: string
  children: React.ReactNode
  ajuda?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label>{rotulo}</Label>
      {children}
      {ajuda ? <p className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  )
}

export function ConfirmarAcao({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar,
  destrutivo,
  onConfirmar,
  onFechar,
}: {
  aberto: boolean
  titulo: string
  descricao: string
  rotuloConfirmar: string
  destrutivo?: boolean
  onConfirmar: () => void
  onFechar: () => void
}) {
  return (
    <AlertDialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction
            variant={destrutivo ? "destructive" : "default"}
            onClick={onConfirmar}
          >
            {rotuloConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Mostra a cadeia Solicitação → Pedido → Compra → Nota Fiscal, destacando o passo atual. */
export function Fluxo({
  passos,
}: {
  passos: Array<{ rotulo: string; valor: string | null; atual?: boolean }>
}) {
  return (
    <ol
      aria-label="Fluxo da compra"
      className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm"
    >
      {passos.map((p, i) => (
        <li key={p.rotulo} className="flex items-center gap-1">
          {i > 0 && (
            <ChevronRight
              className="size-4 text-muted-foreground"
              aria-hidden
            />
          )}
          <span
            className={
              p.atual
                ? "font-semibold"
                : p.valor
                  ? undefined
                  : "text-muted-foreground"
            }
          >
            {p.rotulo}: <span className="font-mono">{p.valor ?? "—"}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

// ----------------------------------------------------------- seletores remotos
type Tipo = "insumos" | "fornecedores" | "locais" | "setores"

function useOpcoes(api: ComprasApi, tipo: Tipo, busca: string, ativo: boolean) {
  const termo = useAtraso(busca.trim())
  const [res, setRes] = useState<{
    chave: string
    opcoes: Opcao[]
    erro: string
  }>({ chave: "", opcoes: [], erro: "" })
  const chave = `${tipo}|${termo}`
  useEffect(() => {
    if (!ativo) return
    let vivo = true
    const q = new URLSearchParams({ tipo, limite: "20" })
    if (termo) q.set("busca", termo)
    api.get<{ opcoes: Opcao[] }>(`${BASE}/opcoes?${q}`).then(
      (r) => vivo && setRes({ chave, opcoes: r.opcoes, erro: "" }),
      (e: unknown) => vivo && setRes({ chave, opcoes: [], erro: mensagem(e) }),
    )
    return () => {
      vivo = false
    }
  }, [api, tipo, termo, chave, ativo])
  return { ...res, carregando: ativo && res.chave !== chave }
}

/** Campo de busca com resultados do servidor. Chama `onEscolher` e mantém o foco para múltiplas inclusões. */
export function SeletorRemoto({
  api,
  tipo,
  onEscolher,
  placeholder,
  desabilitado,
}: {
  api: ComprasApi
  tipo: Tipo
  onEscolher: (o: Opcao) => void
  placeholder: string
  desabilitado?: boolean
}) {
  const [busca, setBusca] = useState("")
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const { opcoes, erro, carregando } = useOpcoes(
    api,
    tipo,
    busca,
    aberto && !desabilitado,
  )
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener("mousedown", fora)
    return () => document.removeEventListener("mousedown", fora)
  }, [])
  return (
    <div ref={raiz} className="relative">
      <Input
        role="combobox"
        aria-expanded={aberto}
        aria-label={placeholder}
        placeholder={placeholder}
        disabled={desabilitado}
        value={busca}
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          setBusca(e.target.value)
          setAberto(true)
        }}
        onKeyDown={(e) => e.key === "Escape" && setAberto(false)}
      />
      {aberto && !desabilitado && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-popover p-1 text-sm shadow-md"
        >
          {erro ? (
            <li className="px-2 py-1.5 text-destructive">{erro}</li>
          ) : carregando && !opcoes.length ? (
            <li className="px-2 py-1.5 text-muted-foreground">Buscando…</li>
          ) : !opcoes.length ? (
            <li className="px-2 py-1.5 text-muted-foreground">
              Nada encontrado.
            </li>
          ) : (
            opcoes.map((o) => (
              <li key={o.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => {
                    onEscolher(o)
                    setBusca("")
                    setAberto(false)
                  }}
                >
                  <span>{o.nome}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {[o.codigo, o.unidade].filter(Boolean).join(" · ")}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

export function SeletorUnico({
  api,
  tipo,
  valor,
  onChange,
  placeholder,
  desabilitado,
  opcional,
}: {
  api: ComprasApi
  tipo: Tipo
  valor: { id: number; nome: string } | null
  onChange: (o: { id: number; nome: string } | null) => void
  placeholder: string
  desabilitado?: boolean
  opcional?: boolean
}) {
  if (valor)
    return (
      <div className="flex h-8 items-center justify-between rounded-lg border px-2.5 text-sm">
        <span>{valor.nome}</span>
        {!desabilitado && (opcional || true) && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => onChange(null)}
            aria-label={`Trocar ${placeholder}`}
          >
            <X /> Trocar
          </Button>
        )}
      </div>
    )
  return (
    <SeletorRemoto
      api={api}
      tipo={tipo}
      placeholder={placeholder}
      desabilitado={desabilitado}
      onEscolher={(o) => onChange({ id: o.id, nome: o.nome })}
    />
  )
}

// ------------------------------------------------------------- editor de itens
export type ItemForm = {
  idProduto: number
  codigo: string
  nome: string
  unidade: string
  quantidade: string
  valorUnitario: string
}

export function itemDeOpcao(o: Opcao): ItemForm {
  return {
    idProduto: o.id,
    codigo: o.codigo ?? "",
    nome: o.nome,
    unidade: o.unidade ?? "",
    quantidade: "",
    valorUnitario: "",
  }
}

/** Valida os itens no cliente com as mesmas regras do servidor; devolve a primeira mensagem de erro. */
export function validarItens(
  itens: ItemForm[],
  comValores: boolean,
): string | null {
  if (!itens.length) return "Adicione ao menos um item."
  for (const i of itens) {
    if (!i.idProduto) return "Há item sem insumo selecionado."
    if (!quantidadeValida(numero(i.quantidade)))
      return `${i.nome}: informe uma quantidade maior que zero (até 3 casas).`
    if (comValores && !valorValido(numero(i.valorUnitario)))
      return `${i.nome}: informe o valor unitário (não negativo, até 2 casas).`
  }
  return null
}

export function totalDosItens(itens: ItemForm[]): string | null {
  try {
    return somarValores(
      itens.map((i) => {
        const q = numero(i.quantidade),
          v = numero(i.valorUnitario)
        return quantidadeValida(q) && valorValido(v) ? totalItem(q, v) : "0.00"
      }),
    )
  } catch {
    return null
  }
}

export function EditorItens({
  api,
  itens,
  onChange,
  comValores,
  desabilitado,
}: {
  api: ComprasApi
  itens: ItemForm[]
  onChange: (itens: ItemForm[]) => void
  comValores: boolean
  desabilitado?: boolean
}) {
  const [aviso, setAviso] = useState("")
  const atualizar = (idx: number, parcial: Partial<ItemForm>) =>
    onChange(itens.map((it, i) => (i === idx ? { ...it, ...parcial } : it)))
  const total = comValores ? totalDosItens(itens) : null
  return (
    <div className="space-y-3">
      {!desabilitado && (
        <SeletorRemoto
          api={api}
          tipo="insumos"
          placeholder="Pesquisar insumo por nome ou código…"
          onEscolher={(o) => {
            if (itens.some((i) => i.idProduto === o.id))
              return setAviso(
                `“${o.nome}” já está na lista; altere a quantidade existente.`,
              )
            setAviso("")
            onChange([...itens, itemDeOpcao(o)])
          }}
        />
      )}
      {aviso && (
        <p role="status" className="text-sm text-amber-600">
          {aviso}
        </p>
      )}
      {itens.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nenhum item adicionado.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Insumo</TableHead>
                <TableHead className="w-32">Quantidade</TableHead>
                <TableHead className="w-20">Unidade</TableHead>
                {comValores && (
                  <TableHead className="w-32">Valor unit. (R$)</TableHead>
                )}
                {comValores && (
                  <TableHead className="w-28 text-right">Total</TableHead>
                )}
                <TableHead className="w-10">
                  <span className="sr-only">Remover</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((it, idx) => {
                const q = numero(it.quantidade),
                  v = numero(it.valorUnitario)
                const linha =
                  comValores && quantidadeValida(q) && valorValido(v)
                    ? totalItem(q, v)
                    : null
                return (
                  <TableRow key={it.idProduto}>
                    <TableCell>
                      <div className="font-medium">{it.nome}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {it.codigo}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Quantidade de ${it.nome}`}
                        inputMode="decimal"
                        value={it.quantidade}
                        disabled={desabilitado}
                        aria-invalid={
                          it.quantidade !== "" && !quantidadeValida(q)
                        }
                        placeholder="0"
                        onChange={(e) =>
                          atualizar(idx, { quantidade: e.target.value })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {it.unidade || "—"}
                    </TableCell>
                    {comValores && (
                      <TableCell>
                        <Input
                          aria-label={`Valor unitário de ${it.nome}`}
                          inputMode="decimal"
                          value={it.valorUnitario}
                          disabled={desabilitado}
                          aria-invalid={
                            it.valorUnitario !== "" && !valorValido(v)
                          }
                          placeholder="0,00"
                          onChange={(e) =>
                            atualizar(idx, { valorUnitario: e.target.value })
                          }
                        />
                      </TableCell>
                    )}
                    {comValores && (
                      <TableCell className="text-right tabular-nums">
                        {linha ? moeda(linha) : "—"}
                      </TableCell>
                    )}
                    <TableCell>
                      {!desabilitado && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remover ${it.nome}`}
                          onClick={() =>
                            onChange(itens.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {comValores && total !== null && itens.length > 0 && (
        <p className="text-right text-sm">
          Total do pedido:{" "}
          <strong className="tabular-nums">{moeda(total)}</strong>
        </p>
      )}
    </div>
  )
}

export { Plus }

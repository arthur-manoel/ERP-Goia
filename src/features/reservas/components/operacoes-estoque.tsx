"use client"

import { lerRespostaOperacao } from "@/features/erp/resposta-operacao"
import { CadastroPedidos } from "@/features/pedidos/components/cadastro-pedidos"

import Link from "next/link"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { rotuloData } from "@/features/erp/datas"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import {
  CadastroOrdem,
  type ResumoOrdem,
  type DadosOrdem,
  type OrdemCadastro,
} from "@/features/producao/components/cadastro-ordem"
import { formatarDataHora, formatarQuantidade } from "@/lib/formatacao"
import {
  quantidade as quantidadeOperacional,
  entregaSchema,
  consumoSchema,
  receberTransferenciaSchema,
} from "@/modules/reservas/reservas.schema"

import { reservasParaConsumo } from "../consumo"
import {
  formatarMilesimos,
  milesimos,
  quantidadeDaEntrega,
  saldoTransferivel,
  zero,
} from "../quantidades"

import { FormularioPlanejamentoOP } from "@/features/producao/components/formulario-planejamento-op"

type Origem = "PEDIDO" | "PRODUCAO" | "RESERVAS"
type Variacao = {
  id: number
  cores: { nome: string } | null
  tamanhos: { nome: string } | null
}
type Reserva = {
  id: number
  id_produto: number
  id_variacao: number | null
  id_pedido_cliente_item: number | null
  id_ordem_producao: number | null
  id_necessidade_producao: number | null
  id_local_estoque: number
  quantidade: string
  quantidade_consumida: string
  quantidade_liberada: string
  restante: string
  status: string
  protocolo_integrado: boolean
  data_reserva: string
  usuarios: { nome: string }
  produtos: { nome: string; unidade: string }
  locais_estoque: { nome: string } | null
  produto_variacoes: Variacao | null
  pedido_cliente_item: { id_pedido_cliente: number } | null
}
type Produto = {
  id: number
  nome: string
  unidade: string
  permite_producao: boolean
  possui_grade: boolean
  produto_variacoes: Variacao[]
  estoque: {
    id_local_estoque: number
    id_setor: number
    quantidade: string
    quantidade_reservada: string
    estoque_variacao: {
      id_variacao: number
      quantidade: string
      quantidade_reservada: string
    }[]
  }[]
}
type Opcoes = {
  produtos: Produto[]
  locais: { id: number; nome: string }[]
  setores: { id: number; nome: string }[]
}
type Documento = { id: number; numero: string; status: string }
type Pedido = Documento & {
  versao: number
  id_endereco_entrega: number | null
  destinatario: string | null
  telefone_entrega: string | null
  endereco_entrega: string | null
  numero_entrega: string | null
  complemento_entrega: string | null
  bairro_entrega: string | null
  cidade_entrega: string | null
  estado_entrega: string | null
  cep_entrega: string | null
  referencia_entrega: string | null
  contatosCliente: {
    tipo: string
    valor: string
    descricao: string | null
    principal: boolean
  }[]
  pedido_cliente_fechamento: { id: number }[]
  pedido_cliente_item: {
    id: number
    id_produto: number
    id_variacao: number | null
    descricao: string
    unidade: string
    quantidade: string
    reserva_estoque: Reserva[]
    pedido_cliente_entrega_item: {
      quantidade: string
      pedido_cliente_entrega: { status: string }
    }[]
  }[]
}
type Ordem = DadosOrdem & {
  itensComPerdaIntegral?: number[]
  id_local_estoque: number | null
  id_setor: number | null
  ordem_producao_item: {
    id: number
    id_produto: number
    id_cor: number | null
    id_tamanho: number | null
    quantidade: string
    quantidade_produzida: string
    produtos: {
      nome: string
      unidade: string
      estoque: { id_local_estoque: number; id_setor: number }[]
      produto_variacoes: (Variacao & {
        id_cor: number | null
        id_tamanho: number | null
        elegivel: boolean
      })[]
    }
  }[]
  ordem_producao_consumo_planejado: {
    id_materia_prima: number
    quantidade_necessaria: string
    produtos: { nome: string; unidade: string }
  }[]
  necessidade_producao: {
    id: number
    id_produto: number
    quantidade_necessaria: string
    quantidade_reservada: string
    quantidade_consumida: string
    consumo_confirmado_em: string | null
  }[]
  reserva_estoque: Reserva[]
}
type Pendente = {
  url: string
  metodo: string
  body: unknown
  chave: string
  headers?: Record<string, string>
}
type Api = ReturnType<typeof useAutenticacao>["requisitar"]
const grade = (v: Variacao | null) =>
  v
    ? [v.cores?.nome, v.tamanhos?.nome].filter(Boolean).join(" / ") ||
      "Sem cor e tamanho"
    : "Sem grade"
const saldoReserva = (r: Reserva) =>
  milesimos(r.quantidade) -
  milesimos(r.quantidade_consumida) -
  milesimos(r.quantidade_liberada)
const assinar = (fn: () => void) => {
  window.addEventListener("storage", fn)
  return () => window.removeEventListener("storage", fn)
}
const rotaDeTransferencia = (url: string) =>
  /^\/api\/estoque\/transferencias\/(?:enviar|\d+\/receber)$/.test(url)

function lerPendente(armazenado: string | null): Pendente | null {
  try {
    const v = armazenado ? (JSON.parse(armazenado) as Pendente) : null
    return v &&
      typeof v.url === "string" &&
      v.url.startsWith("/api/") &&
      typeof v.chave === "string" &&
      ["POST", "PUT", "PATCH"].includes(v.metodo)
      ? v
      : null
  } catch {
    return null
  }
}

function useRegistroSessao(chave: string) {
  return useSyncExternalStore(
    assinar,
    useCallback(() => {
      try {
        return sessionStorage.getItem(chave)
      } catch {
        return null
      }
    }, [chave]),
    () => null,
  )
}
async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const erro = await response.json().catch(() => null)
    throw new Error(erro?.error ?? "Não foi possível consultar os dados.", {
      cause: response.status,
    })
  }
  const value = await response.json()
  return (value.data ?? value) as T
}
function useConsulta<T>(
  url: string | null,
  requisitar: Api,
  revisao: number,
  manterDados = false,
) {
  const [estado, setEstado] = useState<{
    url?: string
    dados: T | null
    erro: string
    status?: number
    revisao?: number
  }>({
    dados: null,
    erro: "",
  })
  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    requisitar(url, { signal: controller.signal })
      .then(json<T>)
      .then((dados) => {
        if (!controller.signal.aborted)
          setEstado({ url, dados, erro: "", revisao })
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setEstado((anterior) => ({
            url,
            dados: manterDados ? anterior.dados : null,
            erro: e instanceof Error ? e.message : "Falha na consulta.",
            status:
              e instanceof Error && typeof e.cause === "number"
                ? e.cause
                : undefined,
            revisao,
          }))
      })
    return () => controller.abort()
  }, [url, requisitar, revisao, manterDados])
  return {
    ...(estado.url === url || (url && manterDados)
      ? estado
      : { dados: null, erro: "", status: undefined }),
    carregando: Boolean(
      url && (estado.url !== url || estado.revisao !== revisao),
    ),
  }
}
function Seletor({
  titulo,
  valor,
  alterar,
  opcoes,
}: {
  titulo: string
  valor: string
  alterar: (v: string) => void
  opcoes: { value: string; label: string }[]
}) {
  return (
    <SearchSelect
      label={titulo}
      value={valor}
      onValueChange={alterar}
      options={opcoes}
      placeholder={`Selecione ${titulo.toLowerCase()}`}
    />
  )
}
function Campo({
  nome,
  titulo,
  inicial,
  tipo = "text",
  obrigatorio = true,
  erro,
}: {
  nome: string
  titulo: string
  inicial?: string
  tipo?: string
  obrigatorio?: boolean
  erro?: string
}) {
  return (
    <Field>
      <FieldLabel htmlFor={nome}>{titulo}</FieldLabel>
      <Input
        id={nome}
        name={nome}
        type={tipo}
        defaultValue={inicial}
        required={obrigatorio}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${nome}-erro` : undefined}
      />
      {erro && (
        <p id={`${nome}-erro`} role="alert" className="text-destructive">
          {erro}
        </p>
      )}
    </Field>
  )
}

export function OperacoesEstoque({ origem = "RESERVAS" }: { origem?: Origem }) {
  const { estado, usuario, empresa, empresas, selecionarEmpresa } =
    useAutenticacao()
  return (
    <>
      <PageHeader
        titulo={
          origem === "PEDIDO"
            ? "Pedidos e entregas"
            : origem === "PRODUCAO"
              ? "Produção e estoque"
              : "Reservas de estoque"
        }
        descricao="Consulte os documentos e confirme as operações da empresa ativa."
      />
      {empresas.length > 1 && (
        <Seletor
          titulo="Empresa ativa"
          valor={empresa ? String(empresa.id) : ""}
          alterar={(v) => selecionarEmpresa(Number(v))}
          opcoes={empresas.map((e) => ({ value: String(e.id), label: e.nome }))}
        />
      )}
      {estado === "carregando" ? (
        <Skeleton className="h-64 w-full" />
      ) : estado !== "autenticado" || !empresa || !usuario ? (
        <Alert>
          <AlertDescription>
            Entre na sua conta e selecione uma empresa.
          </AlertDescription>
        </Alert>
      ) : (
        <Conteudo
          key={`${usuario.id}:${empresa.id}:${origem}`}
          origem={origem}
          identidade={`${usuario.email}:${empresa.id}`}
          idUsuario={usuario.id}
          idEmpresa={empresa.id}
        />
      )}
    </>
  )
}

function Conteudo({
  origem,
  identidade,
  idUsuario,
  idEmpresa,
}: {
  origem: Origem
  identidade: string
  idUsuario: string | number
  idEmpresa: number
}) {
  const { requisitar: executarRequisicao } = useAutenticacao()
  const requisitar = useCallback<Api>(
    (url, init) => {
      const headers = new Headers(init?.headers)
      headers.set("X-Empresa-Id", String(idEmpresa))
      return executarRequisicao(url, { ...init, headers })
    },
    [executarRequisicao, idEmpresa],
  )
  const [revisao, setRevisao] = useState(0)
  const [revisaoEntrega, setRevisaoEntrega] = useState(0)
  const [confirmacaoTransferencia, setConfirmacaoTransferencia] =
    useState<ConfirmacaoTransferencia | null>(null)
  const [versaoEnvio, setVersaoEnvio] = useState(0)
  const [erro, setErro] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [ordemCriada, setOrdemCriada] = useState<number>()
  const trava = useRef(false)
  const envioAtivo = useRef<AbortController | null>(null)
  useEffect(() => () => envioAtivo.current?.abort(), [])
  const chaveOperacoes = `erp-operacao-estoque:${identidade}`
  const chaveTransferencias = `erp-transferencia-estoque:${idUsuario}:${idEmpresa}`
  const registroOperacoes = useRegistroSessao(chaveOperacoes)
  const registroTransferencias = useRegistroSessao(chaveTransferencias)
  const pendenteOperacoes = useMemo(
    () => lerPendente(registroOperacoes),
    [registroOperacoes],
  )
  const pendenteTransferencia = useMemo(
    () => lerPendente(registroTransferencias),
    [registroTransferencias],
  )
  const pendente = pendenteTransferencia ?? pendenteOperacoes
  const transferenciaLegada =
    !pendenteTransferencia &&
    pendenteOperacoes !== null &&
    rotaDeTransferencia(pendenteOperacoes.url)
  const retomandoTransferencia =
    pendente !== null && rotaDeTransferencia(pendente.url)
  const acessoRetomada = useConsulta<{ podeMovimentar: boolean }>(
    retomandoTransferencia && !ocupado
      ? "/api/estoque/transferencias?limite=1"
      : null,
    requisitar,
    revisao,
  )
  const acessoRetomadaNegado =
    !acessoRetomada.carregando &&
    (acessoRetomada.status === 403 ||
      acessoRetomada.dados?.podeMovimentar === false)
  const [buscaProduto, setBuscaProduto] = useState("")
  const {
    dados: opcoes,
    erro: erroOpcoes,
    carregando: atualizandoOpcoes,
  } = useConsulta<Opcoes>(
    `/api/estoque/reservas/opcoes?busca=${encodeURIComponent(buscaProduto)}`,
    requisitar,
    revisao,
    // A busca de produtos não deve desmontar a OP nem apagar o formulário aberto.
    true,
  )
  async function enviar(
    url: string,
    body: unknown,
    metodo = "POST",
    headers?: Record<string, string>,
  ) {
    if (trava.current) return
    const retomada = pendente !== null
    if (pendente && (url !== pendente.url || body !== pendente.body)) return
    const noRegistroDeTransferencias =
      Boolean(pendenteTransferencia) || (!pendente && rotaDeTransferencia(url))
    const chaveStorage = noRegistroDeTransferencias
      ? chaveTransferencias
      : chaveOperacoes
    const armazenado = noRegistroDeTransferencias
      ? registroTransferencias
      : registroOperacoes
    const tentativa = pendente ?? {
      url,
      body,
      metodo,
      chave: crypto.randomUUID(),
      headers,
    }
    const registro = JSON.stringify(tentativa)
    const entrega = /^\/api\/pedidos\/\d+\/entregas$/.test(tentativa.url)
    const despacho = tentativa.url === "/api/estoque/transferencias/enviar"
    const recebimento = /^\/api\/estoque\/transferencias\/\d+\/receber$/.test(
      tentativa.url,
    )
    const limparTentativa = () => {
      if (sessionStorage.getItem(chaveStorage) !== registro) return
      sessionStorage.removeItem(chaveStorage)
      window.dispatchEvent(new Event("storage"))
    }
    try {
      if (sessionStorage.getItem(chaveStorage) !== armazenado) return
      sessionStorage.setItem(chaveStorage, registro)
      window.dispatchEvent(new Event("storage"))
    } catch {
      setErro(
        "Habilite o armazenamento da sessão para preservar a confirmação antes do envio.",
      )
      return
    }
    trava.current = true
    const controller = new AbortController()
    envioAtivo.current = controller
    setOcupado(true)
    setErro("")
    try {
      const resposta = await requisitar(tentativa.url, {
        method: tentativa.metodo,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": tentativa.chave,
          ...tentativa.headers,
          ...(transferenciaLegada && { "X-Recuperar-Transferencia": "1" }),
        },
        body: JSON.stringify(tentativa.body),
      })
      if (controller.signal.aborted) return
      if ((despacho || recebimento) && resposta.status === 403)
        setRevisao((r) => r + 1)
      const value = await lerRespostaOperacao(
        resposta,
        () => {
          limparTentativa()
          setRevisao((r) => r + 1)
        },
        transferenciaLegada
          ? "RECUPERACAO_INDISPONIVEL"
          : retomada && (despacho || recebimento)
            ? "TRANSFERENCIA_RECUSADA"
            : entrega && retomada,
      )
      if (!resposta.ok) {
        throw new Error(
          value.error ?? "Confirmação interrompida; repita a mesma tentativa.",
        )
      }
      limparTentativa()
      if (controller.signal.aborted) return
      if (tentativa.url === "/api/ordens-producao" && value.ordem?.id)
        setOrdemCriada(value.ordem.id)
      if (despacho) setVersaoEnvio((r) => r + 1)
      if (
        (despacho || recebimento) &&
        Number.isInteger(value.data?.idTransferencia)
      )
        setConfirmacaoTransferencia({
          id: value.data.idTransferencia,
          recebida: recebimento,
        })
      toast.success("Operação confirmada no banco.")
      if (entrega) setRevisaoEntrega((r) => r + 1)
      setRevisao((r) => r + 1)
    } catch (e) {
      if (controller.signal.aborted) return
      setErro(
        e instanceof Error &&
          !(e instanceof TypeError || e instanceof SyntaxError)
          ? e.message
          : "Resposta interrompida. Repita a mesma confirmação para evitar duplicidade.",
      )
    } finally {
      envioAtivo.current = null
      trava.current = false
      if (!controller.signal.aborted) setOcupado(false)
    }
  }
  const bloqueado = ocupado || !!pendente
  return (
    <div className="space-y-6">
      {origem === "PEDIDO" && (
        <CadastroPedidos atualizarOperacoes={() => setRevisao((v) => v + 1)} />
      )}
      <div className="flex flex-wrap gap-4">
        <Link href="/estoque/reservas" className="underline">
          Reservas e transferências
        </Link>
        <Link href="/vendas/pedidos" className="underline">
          Pedidos e entregas
        </Link>
        <Link href="/vendas/pedidos/cancelamentos" className="underline">
          Cancelamentos e estornos
        </Link>
        <Link href="/producao/ordens" className="underline">
          Produção e consumo
        </Link>
        <Link href="/financeiro/contas-receber" className="underline">
          Contas a receber
        </Link>
        <Button
          variant="outline"
          disabled={ocupado}
          onClick={() => setRevisao((r) => r + 1)}
        >
          Atualizar dados
        </Button>
      </div>
      {(erro || erroOpcoes) && (
        <Alert variant="destructive">
          <AlertDescription>{erro || erroOpcoes}</AlertDescription>
        </Alert>
      )}
      {pendente && (
        <Alert>
          <AlertDescription>
            Uma confirmação ficou sem resposta conclusiva. Os dados dessa
            tentativa foram preservados.{" "}
            {acessoRetomadaNegado ? (
              "A edição de estoque é necessária para recuperar essa transferência."
            ) : (
              <Button
                disabled={
                  ocupado ||
                  (retomandoTransferencia &&
                    (acessoRetomada.carregando ||
                      !acessoRetomada.dados?.podeMovimentar))
                }
                onClick={() =>
                  enviar(pendente.url, pendente.body, pendente.metodo)
                }
              >
                {transferenciaLegada
                  ? "Consultar confirmação antiga"
                  : "Repetir a mesma confirmação"}
              </Button>
            )}
            {acessoRetomada.erro && !acessoRetomadaNegado && (
              <p role="alert">
                {acessoRetomada.erro} Atualize os dados e tente novamente.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}
      {origem === "PRODUCAO" && (
        <DocumentoOperacional
          key={ordemCriada}
          origem={origem}
          ordemInicial={ordemCriada}
          requisitar={requisitar}
          revisao={revisao}
          revisaoEntrega={revisaoEntrega}
          aoAtualizar={() => setRevisao((r) => r + 1)}
          opcoes={opcoes}
          erroOpcoes={erroOpcoes}
          bloqueado={bloqueado}
          enviar={enviar}
        />
      )}
      <Field>
        <FieldLabel htmlFor="busca-produto-operacao">
          Buscar produto para as operações
        </FieldLabel>
        <Input
          id="busca-produto-operacao"
          value={buscaProduto}
          maxLength={100}
          onChange={(e) => setBuscaProduto(e.target.value)}
          placeholder="Nome do produto; até 50 resultados por busca"
        />
      </Field>
      {!opcoes ? (
        !erroOpcoes && <Skeleton className="h-32 w-full" />
      ) : (
        <>
          {origem === "PEDIDO" && (
            <DocumentoOperacional
              key={origem}
              origem={origem}
              requisitar={requisitar}
              revisao={revisao}
              revisaoEntrega={revisaoEntrega}
              aoAtualizar={() => setRevisao((r) => r + 1)}
              opcoes={opcoes}
              bloqueado={bloqueado}
              enviar={enviar}
            />
          )}
          <Reservas
            requisitar={requisitar}
            revisao={revisao}
            bloqueado={bloqueado}
            enviar={enviar}
          />
          {origem === "RESERVAS" && (
            <Transferencias
              requisitar={requisitar}
              revisao={revisao}
              opcoes={opcoes}
              atualizandoOpcoes={atualizandoOpcoes}
              bloqueado={bloqueado}
              enviar={enviar}
              confirmacao={confirmacaoTransferencia}
              versaoEnvio={versaoEnvio}
            />
          )}
        </>
      )}
    </div>
  )
}
type Enviar = (
  url: string,
  body: unknown,
  metodo?: string,
  headers?: Record<string, string>,
) => Promise<void>
function Caixa({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">{titulo}</h2>
      {children}
    </section>
  )
}

function Reservas({
  requisitar,
  revisao,
  bloqueado,
  enviar,
}: {
  requisitar: Api
  revisao: number
  bloqueado: boolean
  enviar: Enviar
}) {
  const [pagina, setPagina] = useState(1)
  const [origem, setOrigem] = useState("")
  const [status, setStatus] = useState("")
  const [busca, setBusca] = useState("")
  const [detalhe, setDetalhe] = useState<number | null>(null)
  const [historicoPagina, setHistoricoPagina] = useState(1)
  const params = new URLSearchParams({
    pagina: String(pagina),
    limite: "25",
    ...(origem ? { origem } : {}),
    ...(status ? { status } : {}),
    ...(busca ? { busca } : {}),
  })
  const consulta = useConsulta<{ dados: Reserva[]; totalPaginas: number }>(
    `/api/estoque/reservas?${params}`,
    requisitar,
    revisao,
  )
  const historico = useConsulta<{
    reserva: Reserva
    restante: string
    total: number
    historico: {
      id: number
      data_evento: string
      id_usuario: number
      usuarios: { nome: string } | null
      dados_novos: string
    }[]
  }>(
    detalhe
      ? `/api/estoque/reservas/${detalhe}?pagina=${historicoPagina}`
      : null,
    requisitar,
    revisao,
  )
  return (
    <Caixa titulo="Reservas">
      <div className="grid gap-3 sm:grid-cols-3">
        <Seletor
          titulo="Origem"
          valor={origem}
          alterar={(v) => {
            setOrigem(v)
            setPagina(1)
          }}
          opcoes={[
            { value: "", label: "Todas" },
            { value: "PEDIDO", label: "Pedido" },
            { value: "PRODUCAO", label: "Produção" },
          ]}
        />
        <Seletor
          titulo="Situação"
          valor={status}
          alterar={(v) => {
            setStatus(v)
            setPagina(1)
          }}
          opcoes={[
            { value: "", label: "Todas" },
            ...["ATIVA", "ATENDIDA", "CANCELADA"].map((s) => ({
              value: s,
              label: s,
            })),
          ]}
        />
        <Field>
          <FieldLabel htmlFor="busca-reserva">Buscar produto</FieldLabel>
          <Input
            id="busca-reserva"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value)
              setPagina(1)
            }}
            maxLength={100}
          />
        </Field>
      </div>
      {consulta.erro && (
        <Alert variant="destructive">
          <AlertDescription>{consulta.erro}</AlertDescription>
        </Alert>
      )}
      {consulta.dados && (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    "Origem",
                    "Produto / variação",
                    "Local",
                    "Reservada / consumida / liberada / restante",
                    "Situação",
                    "Data / responsável",
                    "Detalhes",
                  ].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {consulta.dados.dados.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link
                        className="underline"
                        href={
                          r.id_ordem_producao
                            ? `/producao/ordens?ordem=${r.id_ordem_producao}`
                            : `/vendas/pedidos?pedido=${r.pedido_cliente_item?.id_pedido_cliente ?? ""}`
                        }
                      >
                        {r.id_ordem_producao
                          ? `OP ${r.id_ordem_producao}`
                          : `Pedido ${r.pedido_cliente_item?.id_pedido_cliente ?? "legado"}`}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {r.produtos.nome}
                      <br />
                      {grade(r.produto_variacoes)} · {r.produtos.unidade}
                    </TableCell>
                    <TableCell>{r.locais_estoque?.nome}</TableCell>
                    <TableCell>
                      {r.protocolo_integrado
                        ? [
                            r.quantidade,
                            r.quantidade_consumida,
                            r.quantidade_liberada,
                            r.restante,
                          ]
                            .map((q) => formatarQuantidade(q))
                            .join(" / ")
                        : "Registro legado sem detalhamento"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {formatarDataHora(new Date(r.data_reserva))}
                      <br />
                      {r.usuarios.nome}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setDetalhe(r.id)
                          setHistoricoPagina(1)
                        }}
                      >
                        Ver reserva
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!consulta.dados.dados.length && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      Nenhuma reserva encontrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => p - 1)}
            >
              Anterior
            </Button>
            <span>Página {pagina}</span>
            <Button
              variant="outline"
              disabled={pagina >= consulta.dados.totalPaginas}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      )}
      {detalhe && (
        <div className="space-y-3 rounded-lg border p-3">
          <h3 className="font-semibold">Reserva #{detalhe}</h3>
          {historico.erro && <p role="alert">{historico.erro}</p>}
          {historico.dados && (
            <>
              <p>
                Quantidade restante:{" "}
                {formatarQuantidade(historico.dados.restante)}
              </p>
              {historico.dados.historico.map((h) => {
                let evento: { evento?: string; motivo?: string } = {}
                try {
                  evento = JSON.parse(h.dados_novos) as typeof evento
                } catch {
                  /* Histórico legado permanece disponível no banco. */
                }
                return (
                  <p key={h.id}>
                    {formatarDataHora(new Date(h.data_evento))} ·{" "}
                    {h.usuarios?.nome ?? "Responsável não registrado no legado"}{" "}
                    · {evento.evento ?? "Reserva registrada"}{" "}
                    {evento.motivo && `· ${evento.motivo}`}
                  </p>
                )
              })}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={historicoPagina <= 1}
                  onClick={() => setHistoricoPagina((p) => p - 1)}
                >
                  Histórico anterior
                </Button>
                <Button
                  variant="outline"
                  disabled={historicoPagina * 25 >= historico.dados.total}
                  onClick={() => setHistoricoPagina((p) => p + 1)}
                >
                  Mais histórico
                </Button>
              </div>
              {historico.dados.reserva.protocolo_integrado &&
                historico.dados.reserva.status === "ATIVA" && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      const fd = new FormData(e.currentTarget)
                      void enviar(`/api/estoque/reservas/${detalhe}/liberar`, {
                        quantidade: String(
                          fd.get("liberar-quantidade"),
                        ).replace(",", "."),
                        motivo: fd.get("liberar-motivo"),
                      })
                    }}
                  >
                    <fieldset
                      disabled={bloqueado}
                      className="grid gap-3 sm:grid-cols-3"
                    >
                      <Campo
                        nome="liberar-quantidade"
                        titulo="Quantidade a liberar"
                      />
                      <Campo
                        nome="liberar-motivo"
                        titulo="Motivo da liberação"
                      />
                      <Button type="submit" className="self-end">
                        Liberar saldo da reserva
                      </Button>
                    </fieldset>
                  </form>
                )}
            </>
          )}
        </div>
      )}
    </Caixa>
  )
}

function DocumentoOperacional({
  origem,
  ordemInicial,
  requisitar,
  revisao,
  revisaoEntrega,
  aoAtualizar,
  opcoes,
  erroOpcoes,
  bloqueado,
  enviar,
}: {
  origem: Exclude<Origem, "RESERVAS">
  ordemInicial?: number
  requisitar: Api
  revisao: number
  revisaoEntrega: number
  aoAtualizar: () => void
  opcoes: Opcoes | null
  erroOpcoes?: string
  bloqueado: boolean
  enviar: Enviar
}) {
  const [busca, setBusca] = useState("")
  const [pagina, setPagina] = useState(1)
  const [escolhido, setId] = useState(ordemInicial?.toString() ?? "")
  const [status, setStatus] = useState("")
  const [repetirConsulta, setRepetirConsulta] = useState(0)
  const [revisaoCadastro, setRevisaoCadastro] = useState(0)
  const [planejamento, setPlanejamento] = useState<"novo" | Ordem | null>(null)
  const urlInicial = useSyncExternalStore(
    useCallback((fn) => {
      window.addEventListener("popstate", fn)
      return () => window.removeEventListener("popstate", fn)
    }, []),
    useCallback(
      () =>
        new URL(window.location.href).searchParams.get(
          origem === "PEDIDO" ? "pedido" : "ordem",
        ) ?? "",
      [origem],
    ),
    () => "",
  )
  const id = escolhido || urlInicial
  const url =
    origem === "PEDIDO"
      ? `/api/pedidos?pagina=${pagina}&limite=25&busca=${encodeURIComponent(busca)}`
      : `/api/ordens-producao/resumo?page=${pagina}&limit=25&busca=${encodeURIComponent(busca)}${status ? `&status=${status}` : ""}`
  const lista = useConsulta<{
    dados?: { idPedido: number; numero: string; status: string }[]
    paginacao?: { totalPaginas: number }
    rows?: ResumoOrdem[]
    totalPages?: number
  }>(url, requisitar, revisao + repetirConsulta + revisaoCadastro)
  const cabecalho = useConsulta<{
    ordem: OrdemCadastro
    fluxoSnapshot?: { nome: string }
  }>(
    origem === "PRODUCAO" && id ? `/api/ordens-producao/${id}` : null,
    requisitar,
    revisao + revisaoCadastro,
  )
  const detalhes = useConsulta<Pedido | Ordem>(
    id && opcoes
      ? `/api/${origem === "PEDIDO" ? "pedidos" : "ordem_producao"}/${id}/operacao`
      : null,
    requisitar,
    revisao + revisaoCadastro,
  )
  const rows =
    lista.dados?.rows ??
    lista.dados?.dados?.map((p) => ({
      id: p.idPedido,
      numero: p.numero,
      status: p.status,
    })) ??
    []
  return (
    <Caixa
      titulo={
        origem === "PEDIDO"
          ? "Confirmar pedido, reservar e entregar"
          : "Ordens de produção"
      }
    >
      {origem === "PRODUCAO" && opcoes && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={bloqueado || !opcoes.locais.length}
            onClick={() => setPlanejamento("novo")}
          >
            Nova ordem com número manual
          </Button>
          {!opcoes.locais.length && (
            <p>Cadastre um local de estoque ativo para abrir a ordem.</p>
          )}
          {detalhes.dados?.status === "PLANEJADA" &&
            "ordem_producao_item" in detalhes.dados &&
            detalhes.dados.ordem_producao_item.length === 0 && (
              <Button
                variant="outline"
                disabled={bloqueado}
                onClick={() => setPlanejamento(detalhes.dados as Ordem)}
              >
                Completar ordem planejada
              </Button>
            )}
        </div>
      )}
      {planejamento && opcoes && (
        <FormularioPlanejamentoOP
          inicial={planejamento === "novo" ? undefined : planejamento}
          produtos={opcoes.produtos}
          locais={opcoes.locais}
          onClose={() => setPlanejamento(null)}
          onSalvo={(id) => {
            setId(String(id))
            setPlanejamento(null)
            setRevisaoCadastro((r) => r + 1)
            aoAtualizar()
          }}
        />
      )}
      <Field>
        <FieldLabel htmlFor="buscar-documento">
          Buscar número do documento
        </FieldLabel>
        <Input
          id="buscar-documento"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value)
            setPagina(1)
          }}
          maxLength={50}
        />
      </Field>
      {origem === "PRODUCAO" && (
        <Field>
          <FieldLabel htmlFor="status-op">Situação</FieldLabel>
          <NativeSelect
            id="status-op"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setPagina(1)
            }}
          >
            <NativeSelectOption value="">Todas</NativeSelectOption>
            {Object.entries(situacoesOrdem).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}
      {lista.carregando && <p role="status">Carregando documentos…</p>}
      {lista.erro && !lista.carregando && (
        <Alert variant="destructive">
          <AlertDescription>
            {lista.status === 403
              ? "Sem acesso à listagem nesta empresa."
              : lista.erro}
            {lista.status !== 403 && (
              <Button
                variant="outline"
                onClick={() => setRepetirConsulta((r) => r + 1)}
              >
                Tentar novamente
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {origem === "PRODUCAO" ? (
        lista.dados &&
        !lista.carregando &&
        (lista.dados.rows?.length ? (
          <ListaOrdens ordens={lista.dados.rows} selecionar={setId} />
        ) : (
          <p>Nenhuma ordem de produção encontrada.</p>
        ))
      ) : (
        <Seletor
          titulo={origem === "PEDIDO" ? "Pedido" : "Ordem de produção"}
          valor={id}
          alterar={setId}
          opcoes={rows.map((d) => ({
            value: String(d.id),
            label: `${d.numero} · ${d.status}`,
          }))}
        />
      )}
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={pagina <= 1}
          onClick={() => setPagina((p) => p - 1)}
        >
          Anterior
        </Button>
        <span>Página {pagina}</span>
        <Button
          variant="outline"
          disabled={
            lista.carregando ||
            pagina >=
              (lista.dados?.totalPages ??
                lista.dados?.paginacao?.totalPaginas ??
                0)
          }
          onClick={() => setPagina((p) => p + 1)}
        >
          Próxima
        </Button>
      </div>
      {origem === "PRODUCAO" && lista.status !== 401 && (
        <CadastroOrdem
          key={`cadastro:${id}`}
          requisitar={requisitar}
          ordem={cabecalho.dados?.ordem ?? null}
          fluxo={cabecalho.dados?.fluxoSnapshot?.nome}
          bloqueado={bloqueado || cabecalho.carregando}
          revisaoDados={revisao}
          enviar={enviar}
        />
      )}
      {cabecalho.erro && (
        <Alert variant="destructive">
          <AlertDescription>{cabecalho.erro}</AlertDescription>
        </Alert>
      )}
      {cabecalho.dados &&
        ((!opcoes && erroOpcoes) || detalhes.status === 403) && (
          <AcoesFluxoOrdem
            ordem={cabecalho.dados.ordem}
            comSnapshot={Boolean(cabecalho.dados.fluxoSnapshot)}
            faltaDestino={cabecalho.dados.ordem.id_local_estoque === null}
            podeConcluir={false}
            bloqueado={bloqueado || cabecalho.carregando}
            enviar={enviar}
          />
        )}
      {detalhes.erro && (
        <Alert variant="destructive">
          <AlertDescription>{detalhes.erro}</AlertDescription>
        </Alert>
      )}
      {id &&
        detalhes.dados &&
        opcoes &&
        (origem === "PEDIDO" || cabecalho.dados) && (
          <DetalheDocumento
            requisitar={requisitar}
            revisao={revisao}
            revisaoEntrega={revisaoEntrega}
            key={`detalhe:${id}`}
            origem={origem}
            documento={detalhes.dados}
            opcoes={opcoes}
            bloqueado={bloqueado || detalhes.carregando || cabecalho.carregando}
            enviar={enviar}
            comSnapshot={Boolean(cabecalho.dados?.fluxoSnapshot)}
          />
        )}
    </Caixa>
  )
}

const situacoesOrdem: Record<string, string> = {
  PLANEJADA: "Planejada",
  AGUARDANDO_MATERIAL: "Aguardando material",
  LIBERADA: "Liberada",
  EM_PRODUCAO: "Em produção",
  PAUSADA: "Pausada",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
}

function ListaOrdens({
  ordens,
  selecionar,
}: {
  ordens: ResumoOrdem[]
  selecionar: (id: string) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ordem</TableHead>
          <TableHead>Produto e variação</TableHead>
          <TableHead>Planejada</TableHead>
          <TableHead>Produzida por item</TableHead>
          <TableHead>Situação</TableHead>
          <TableHead>Etapa</TableHead>
          <TableHead>Previsão</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordens.map((ordem) => (
          <TableRow key={ordem.id}>
            <TableCell>
              <Button
                variant="link"
                className="px-0"
                onClick={() => selecionar(String(ordem.id))}
              >
                {ordem.numero}
              </Button>
            </TableCell>
            <TableCell>
              {ordem.itens.map((item) => (
                <div key={item.id}>
                  {[
                    item.produtos.nome,
                    item.cores?.nome,
                    item.tamanhos?.nome ?? item.tamanhoLegado,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ))}
            </TableCell>
            <TableCell>
              {formatarQuantidade(ordem.quantidade_planejada)}
            </TableCell>
            <TableCell>
              {ordem.itens.map((item) => (
                <div key={item.id}>
                  {formatarQuantidade(item.quantidade_produzida)}
                </div>
              ))}
            </TableCell>
            <TableCell>
              {situacoesOrdem[ordem.status] ?? ordem.status}
            </TableCell>
            <TableCell>
              {ordem.etapaAtual
                ? `${ordem.etapaAtual.ordem} · ${ordem.etapaAtual.setores.nome}`
                : (ordem.setorAtual ?? "—")}
            </TableCell>
            <TableCell>
              {rotuloData(ordem.data_previsao?.slice(0, 10) ?? "")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function temProximoSetor(ordem: DadosOrdem) {
  const etapas = ordem.ordem_producao_fluxo_setor
  const atual = etapas.findIndex((etapa) => etapa.id_setor === ordem.id_setor)
  return atual >= 0 && atual < etapas.length - 1
}

function AcoesFluxoOrdem({
  ordem,
  comSnapshot,
  faltaDestino,
  podeConcluir,
  bloqueado,
  setores,
  enviar,
}: {
  ordem: DadosOrdem
  comSnapshot: boolean
  faltaDestino: boolean
  podeConcluir: boolean
  bloqueado: boolean
  setores?: Opcoes["setores"]
  enviar: Enviar
}) {
  const podeAvancarLegado = !comSnapshot && temProximoSetor(ordem)
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["Liberar OP", ["PLANEJADA", "AGUARDANDO_MATERIAL"], "LIBERADA"],
            [
              "Aguardar material",
              ["PLANEJADA", "LIBERADA"],
              "AGUARDANDO_MATERIAL",
            ],
            ["Iniciar OP", comSnapshot ? [] : ["LIBERADA"], "EM_PRODUCAO"],
            [
              "Avançar para o próximo setor",
              podeAvancarLegado ? ["EM_PRODUCAO"] : [],
              "EM_PRODUCAO",
            ],
            ["Pausar OP", ["EM_PRODUCAO"], "PAUSADA"],
            ["Retomar OP", ["PAUSADA"], "EM_PRODUCAO"],
          ] satisfies [string, string[], string][]
        )
          .filter(([, origens]) => origens.includes(ordem.status))
          .map(([rotulo, , destino]) => (
            <Button
              key={rotulo}
              variant="outline"
              disabled={
                bloqueado ||
                (faltaDestino &&
                  (destino === "LIBERADA" ||
                    (ordem.status === "LIBERADA" && destino === "EM_PRODUCAO")))
              }
              onClick={() =>
                enviar(`/api/ordens-producao/${ordem.id}/avancar`, {
                  statusEsperado: ordem.status,
                  setorEsperado: ordem.id_setor,
                  statusDestino: destino,
                })
              }
            >
              {rotulo}
            </Button>
          ))}
      </div>
      <h3 className="font-semibold">Etapas da produção</h3>
      {ordem.ordem_producao_fluxo_setor.map((etapa) => (
        <div key={etapa.id} className="flex flex-wrap items-center gap-3">
          <span>
            {etapa.ordem} ·{" "}
            {setores?.find((s) => s.id === etapa.id_setor)?.nome ??
              `Setor ${etapa.id_setor}`}{" "}
            · {etapa.status}
          </span>
          {comSnapshot && etapa.status !== "CONCLUIDA" && (
            <Button
              variant="outline"
              disabled={
                bloqueado ||
                (faltaDestino && etapa.status === "PENDENTE") ||
                (ordem.status !== "EM_PRODUCAO" &&
                  !(
                    ordem.status === "LIBERADA" && etapa.status === "PENDENTE"
                  )) ||
                etapa.id !==
                  ordem.ordem_producao_fluxo_setor.find(
                    (e) => e.status !== "CONCLUIDA",
                  )?.id ||
                (etapa.id === ordem.ordem_producao_fluxo_setor.at(-1)?.id &&
                  etapa.status === "EM_PRODUCAO" &&
                  !podeConcluir)
              }
              onClick={() =>
                enviar(
                  `/api/ordens-producao/${ordem.id}/etapas/${etapa.status === "PENDENTE" ? "iniciar" : "concluir"}`,
                  { etapaId: etapa.id },
                )
              }
            >
              {etapa.status === "PENDENTE"
                ? "Iniciar etapa"
                : etapa.id === ordem.ordem_producao_fluxo_setor.at(-1)?.id
                  ? "Concluir última etapa e encerrar OP"
                  : "Concluir etapa"}
            </Button>
          )}
        </div>
      ))}
    </>
  )
}

function DetalheDocumento({
  requisitar,
  revisao,
  revisaoEntrega,
  origem,
  documento,
  opcoes,
  bloqueado,
  enviar,
  comSnapshot,
}: {
  requisitar: Api
  revisao: number
  revisaoEntrega: number
  origem: "PEDIDO" | "PRODUCAO"
  documento: Pedido | Ordem
  opcoes: Opcoes
  bloqueado: boolean
  enviar: Enviar
  comSnapshot: boolean
}) {
  const [item, setItem] = useState("")
  const [local, setLocal] = useState("")
  const [variacao, setVariacao] = useState("")
  const [reservaConsumo, setReservaConsumo] = useState("")
  const [erroLocal, setErroLocal] = useState("")
  const [setorRegularizacao, setSetorRegularizacao] = useState("")
  const [errosEntrega, setErrosEntrega] = useState<Record<number, string>>({})
  const pedido = origem === "PEDIDO" ? (documento as Pedido) : null
  const ordem = origem === "PRODUCAO" ? (documento as Ordem) : null
  const itensSemGradeDefinida =
    ordem?.ordem_producao_item.filter(
      (i) =>
        i.produtos.produto_variacoes.length > 0 &&
        i.produtos.produto_variacoes.filter(
          (v) =>
            v.elegivel &&
            v.id_cor === i.id_cor &&
            v.id_tamanho === i.id_tamanho,
        ).length !== 1,
    ) ?? []
  const faltaSetor =
    !!ordem && !ordem.id_setor && !ordem.ordem_producao_fluxo_setor.length
  const setorFinal =
    ordem?.ordem_producao_fluxo_setor.at(-1)?.id_setor ?? ordem?.id_setor
  const setorDestino = setorFinal ?? Number(setorRegularizacao)
  const locaisCompativeis = ordem
    ? opcoes.locais.filter(
        (local) =>
          !setorDestino ||
          ordem.ordem_producao_item.every((i) =>
            i.produtos.estoque.every(
              (posicao) =>
                (posicao.id_local_estoque === local.id) ===
                (posicao.id_setor === setorDestino),
            ),
          ),
      )
    : []
  const faltaLocal =
    !!ordem &&
    !locaisCompativeis.some((local) => local.id === ordem.id_local_estoque)
  const faltaDestino =
    !!ordem && (faltaLocal || faltaSetor || itensSemGradeDefinida.length > 0)
  const pedidoOperacional = pedido
    ? [
        "RASCUNHO",
        "CONFIRMADO",
        "EM_PRODUCAO",
        "PRONTO",
        "EM_ENTREGA",
        "PARCIALMENTE_ENTREGUE",
      ].includes(pedido.status)
    : false
  const podeReservar = pedido
    ? pedidoOperacional
    : Boolean(
        ordem &&
        ["LIBERADA", "EM_PRODUCAO", "PAUSADA", "AGUARDANDO_MATERIAL"].includes(
          ordem.status,
        ),
      )
  const podeConcluir = Boolean(
    ordem &&
    !faltaDestino &&
    ordem.status === "EM_PRODUCAO" &&
    ordem.ordem_producao_item.length &&
    ordem.ordem_producao_item.every(
      (i) =>
        Number(i.quantidade_produzida) > 0 ||
        ordem.itensComPerdaIntegral?.includes(i.id),
    ) &&
    ordem.ordem_producao_consumo_planejado.every((m) =>
      ordem.necessidade_producao.some(
        (n) => n.id_produto === m.id_materia_prima && n.consumo_confirmado_em,
      ),
    ),
  )
  const escolhas = pedido
    ? pedido.pedido_cliente_item.map((i) => ({
        value: String(i.id),
        label: `${i.descricao} · ${i.unidade}`,
      }))
    : [
        ...new Map(
          ordem!.ordem_producao_consumo_planejado.map((p) => [
            p.id_materia_prima,
            {
              value: String(p.id_materia_prima),
              label: `${p.produtos.nome} · ${p.produtos.unidade}`,
            },
          ]),
        ).values(),
      ]
  const linha = pedido?.pedido_cliente_item.find((i) => String(i.id) === item)
  const produtoId = linha?.id_produto ?? Number(item)
  const produto = opcoes.produtos.find((p) => p.id === produtoId)
  const posicao = produto?.estoque.find(
    (e) => e.id_local_estoque === Number(local),
  )
  const gradePosicao = posicao?.estoque_variacao.find(
    (v) => v.id_variacao === (linha?.id_variacao ?? Number(variacao)),
  )
  const usaGrade = Boolean(linha?.id_variacao || variacao)
  const fisicoSelecionado = usaGrade
    ? milesimos(gradePosicao?.quantidade ?? "0")
    : posicao
      ? milesimos(posicao.quantidade) -
        posicao.estoque_variacao.reduce(
          (s, v) => s + milesimos(v.quantidade),
          zero,
        )
      : zero
  const reservadoSelecionado = usaGrade
    ? milesimos(gradePosicao?.quantidade_reservada ?? "0")
    : posicao
      ? milesimos(posicao.quantidade_reservada) -
        posicao.estoque_variacao.reduce(
          (s, v) => s + milesimos(v.quantidade_reservada),
          zero,
        )
      : zero
  const reservas = pedido
    ? pedido.pedido_cliente_item.flatMap((i) =>
        i.reserva_estoque.map((r) => ({
          ...r,
          nomeItem: i.descricao,
          idItem: i.id,
        })),
      )
    : ordem!.reserva_estoque.map((r) => ({
        ...r,
        nomeItem:
          opcoes.produtos.find((p) => p.id === r.id_produto)?.nome ??
          `Material ${r.id_produto}`,
        idItem: 0,
      }))
  const reservasConsumo = ordem
    ? reservasParaConsumo(reservas, ordem.necessidade_producao)
    : []
  const consumoSelecionado = reservasConsumo.find(
    (r) => r.id === Number(reservaConsumo),
  )
  async function reservar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const q = String(fd.get("reservar-quantidade")).replace(",", ".")
    const validado = quantidadeOperacional.safeParse(q)
    if (!validado.success) {
      setErroLocal(validado.error.issues[0].message)
      return
    }
    if (milesimos(validado.data) > fisicoSelecionado - reservadoSelecionado) {
      setErroLocal(
        "A quantidade excede o disponível nesta variação e local. O pedido pode permanecer em planejamento com saldo pendente.",
      )
      return
    }
    setErroLocal("")
    const dados = {
      origem,
      idOrigem: documento.id,
      ...(pedido ? { idItem: Number(item) } : {}),
      idProduto: produtoId,
      ...(linha?.id_variacao || variacao
        ? { idVariacao: linha?.id_variacao ?? Number(variacao) }
        : {}),
      idLocalEstoque: Number(local),
      quantidade: q,
    }
    await enviar(
      pedido?.status === "RASCUNHO"
        ? `/api/pedidos/${documento.id}/confirmar`
        : "/api/estoque/reservas",
      pedido?.status === "RASCUNHO" ? { reservas: [dados] } : dados,
    )
  }
  return (
    <div className="space-y-5">
      {erroLocal && (
        <Alert variant="destructive">
          <AlertDescription>{erroLocal}</AlertDescription>
        </Alert>
      )}
      <p className="font-semibold">
        {documento.numero} · {documento.status}
      </p>
      {pedido && (
        <section
          className="space-y-2 rounded-lg border p-4"
          aria-label="Endereço e contatos da entrega"
        >
          <h3 className="font-semibold">Entrega e contatos do cliente</h3>
          <p className="text-sm">
            {[
              pedido.destinatario,
              pedido.endereco_entrega,
              pedido.numero_entrega,
              pedido.complemento_entrega,
              pedido.bairro_entrega,
              pedido.cidade_entrega,
              pedido.estado_entrega,
              pedido.cep_entrega,
            ]
              .filter(Boolean)
              .join(", ") || "Endereço não informado no pedido."}
          </p>
          {pedido.referencia_entrega && (
            <p className="text-sm text-muted-foreground">
              Referência: {pedido.referencia_entrega}
            </p>
          )}
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {(pedido.contatosCliente.length
              ? pedido.contatosCliente
              : pedido.telefone_entrega
                ? [
                    {
                      tipo: "TELEFONE",
                      valor: pedido.telefone_entrega,
                      descricao: null,
                      principal: false,
                    },
                  ]
                : []
            ).map((contato, index) => (
              <li key={`${contato.tipo}-${index}`}>
                {contato.tipo}: {contato.valor}
                {contato.descricao ? ` · ${contato.descricao}` : ""}
                {contato.principal ? " · principal" : ""}
              </li>
            ))}
            {!pedido.contatosCliente.length && !pedido.telefone_entrega && (
              <li>Nenhum contato cadastrado.</li>
            )}
          </ul>
        </section>
      )}
      {pedido && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Pedido / reservado / pendente de reserva</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pedido.pedido_cliente_item.map((i) => {
              const entregue = i.pedido_cliente_entrega_item
                .filter(
                  (e) =>
                    !["CANCELADA", "PREPARANDO", "NAO_ENTREGUE"].includes(
                      e.pedido_cliente_entrega.status,
                    ),
                )
                .reduce((s, e) => s + milesimos(e.quantidade), zero)
              const reservado = i.reserva_estoque
                .filter((r) => r.status === "ATIVA")
                .reduce((s, r) => s + saldoReserva(r), zero)
              const pendenteReserva =
                milesimos(i.quantidade) - entregue - reservado
              return (
                <TableRow key={i.id}>
                  <TableCell>
                    {i.descricao} · {i.unidade}
                  </TableCell>
                  <TableCell>
                    {formatarQuantidade(i.quantidade)} /{" "}
                    {formatarMilesimos(reservado)} /{" "}
                    {formatarMilesimos(
                      pendenteReserva > zero ? pendenteReserva : zero,
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      <form onSubmit={reservar}>
        <fieldset
          disabled={bloqueado || !podeReservar}
          className="grid gap-3 sm:grid-cols-2"
        >
          <Seletor
            titulo={pedido ? "Item do pedido" : "Material previsto"}
            valor={item}
            alterar={(v) => {
              setItem(v)
              setVariacao("")
              setLocal("")
            }}
            opcoes={escolhas}
          />
          <Seletor
            titulo="Local da reserva"
            valor={local}
            alterar={setLocal}
            opcoes={opcoes.locais.map((l) => ({
              value: String(l.id),
              label: l.nome,
            }))}
          />
          {!pedido && produto?.produto_variacoes.length ? (
            <Seletor
              titulo="Variação do insumo"
              valor={variacao}
              alterar={setVariacao}
              opcoes={produto.produto_variacoes.map((v) => ({
                value: String(v.id),
                label: grade(v),
              }))}
            />
          ) : null}
          <Campo nome="reservar-quantidade" titulo="Quantidade a reservar" />
          <p className="text-sm text-muted-foreground">
            {posicao
              ? `Físico nesta variação: ${formatarMilesimos(fisicoSelecionado)} · reservado: ${formatarMilesimos(reservadoSelecionado)} · disponível: ${formatarMilesimos(fisicoSelecionado - reservadoSelecionado)}`
              : "Selecione um produto e local com posição física. A confirmação final confere o saldo disponível."}
          </p>
          <Button type="submit" disabled={!item || !local}>
            {pedido?.status === "RASCUNHO"
              ? "Confirmar pedido com esta reserva"
              : "Reservar quantidade informada"}
          </Button>
        </fieldset>
      </form>
      {pedido?.status === "RASCUNHO" && (
        <div className="space-y-2">
          <p>
            Para planejamento sem estoque disponível, a confirmação mantém os
            itens pendentes de reserva.
          </p>
          <Button
            disabled={bloqueado}
            variant="outline"
            onClick={() =>
              enviar(`/api/pedidos/${pedido.id}/confirmar`, { reservas: [] })
            }
          >
            Confirmar para planejamento, sem reserva
          </Button>
        </div>
      )}
      {pedido && pedidoOperacional && pedido.status !== "RASCUNHO" && (
        <form
          key={revisaoEntrega}
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            const erros: Record<number, string> = {}
            const itens = reservas.flatMap((r) => {
              if (r.status !== "ATIVA") return []
              const linha = quantidadeDaEntrega(fd.get(`entregar-${r.id}`))
              if (linha.tipo === "omitida") return []
              if (linha.tipo === "invalida") {
                erros[r.id] =
                  "Informe uma quantidade válida com até três casas decimais."
                return []
              }
              if (milesimos(linha.quantidade) > saldoReserva(r)) {
                erros[r.id] = "A quantidade excede o restante desta reserva."
                return []
              }
              return [
                {
                  idItem: r.idItem,
                  idReserva: r.id,
                  quantidade: linha.quantidade,
                },
              ]
            })
            setErrosEntrega(erros)
            if (Object.keys(erros).length) return
            const dados = {
              nomeRecebedor: fd.get("nome-recebedor"),
              itens,
            }
            const validado = entregaSchema.safeParse(dados)
            if (!validado.success) {
              setErroLocal(validado.error.issues[0].message)
              return
            }
            setErroLocal("")
            void enviar(`/api/pedidos/${pedido.id}/entregas`, validado.data)
          }}
        >
          <fieldset disabled={bloqueado} className="space-y-3">
            <h3 className="font-semibold">
              Confirmar entrega recebida pelo cliente
            </h3>
            <p>
              Informe somente o que foi efetivamente entregue. A saída e o
              consumo da reserva serão confirmados juntos.
            </p>
            <Campo nome="nome-recebedor" titulo="Nome do recebedor" />
            {reservas
              .filter((r) => r.status === "ATIVA")
              .map((r) => (
                <Campo
                  key={r.id}
                  nome={`entregar-${r.id}`}
                  titulo={`${r.nomeItem} · reserva ${r.id} · ${opcoes.locais.find((l) => l.id === r.id_local_estoque)?.nome ?? "Local da reserva"} · restante ${formatarMilesimos(saldoReserva(r))}`}
                  erro={errosEntrega[r.id]}
                  inicial="0"
                  obrigatorio={false}
                />
              ))}
            <Button
              type="submit"
              disabled={!reservas.some((r) => r.status === "ATIVA")}
            >
              Confirmar entrega e saída física
            </Button>
          </fieldset>
        </form>
      )}
      {pedido && ["ENTREGUE", "CONCLUIDO"].includes(pedido.status) && (
        <FecharPedido
          pedido={pedido}
          requisitar={requisitar}
          revisao={revisao}
          bloqueado={bloqueado}
          enviar={enviar}
        />
      )}
      {ordem && (
        <>
          {ordem.ordem_producao_consumo_planejado.length > 0 && (
            <section aria-label="Consumo planejado">
              <h3 className="font-semibold">Consumo planejado</h3>
              <ul>
                {ordem.ordem_producao_consumo_planejado.map(
                  (material, indice) => (
                    <li key={`${material.id_materia_prima}:${indice}`}>
                      {material.produtos.nome} ·{" "}
                      {formatarQuantidade(material.quantidade_necessaria)}{" "}
                      {material.produtos.unidade}
                    </li>
                  ),
                )}
              </ul>
            </section>
          )}
          {faltaDestino &&
            !["CONCLUIDA", "CANCELADA"].includes(ordem.status) && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const fd = new FormData(e.currentTarget)
                  void enviar(`/api/ordem_producao/${ordem.id}/regularizar`, {
                    ...(faltaLocal
                      ? { idLocal: Number(fd.get("destino-local")) }
                      : {}),
                    ...(faltaSetor
                      ? { idSetor: Number(fd.get("destino-setor")) }
                      : {}),
                    variacoes: itensSemGradeDefinida.map((i) => ({
                      idItem: i.id,
                      idVariacao: Number(fd.get(`destino-variacao-${i.id}`)),
                    })),
                    motivo: fd.get("destino-motivo"),
                  })
                }}
              >
                <fieldset disabled={bloqueado} className="space-y-3">
                  <legend className="font-semibold">
                    Regularizar destino da produção
                  </legend>
                  <p>
                    Corrija o destino para liberar, iniciar ou concluir a OP.
                  </p>
                  {faltaLocal && (
                    <Field>
                      <FieldLabel htmlFor="destino-local">
                        Local de entrada dos produtos
                      </FieldLabel>
                      <NativeSelect
                        id="destino-local"
                        name="destino-local"
                        required
                        key={setorDestino}
                        defaultValue=""
                      >
                        <NativeSelectOption value="">
                          Selecione o local
                        </NativeSelectOption>
                        {locaisCompativeis.map((l) => (
                          <NativeSelectOption key={l.id} value={l.id}>
                            {l.nome}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}
                  {faltaSetor && (
                    <Field>
                      <FieldLabel htmlFor="destino-setor">
                        Setor de entrada dos produtos
                      </FieldLabel>
                      <NativeSelect
                        id="destino-setor"
                        name="destino-setor"
                        required
                        value={setorRegularizacao}
                        onChange={(e) => setSetorRegularizacao(e.target.value)}
                      >
                        <NativeSelectOption value="">
                          Selecione o setor
                        </NativeSelectOption>
                        {opcoes.setores.map((s) => (
                          <NativeSelectOption key={s.id} value={s.id}>
                            {s.nome}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </Field>
                  )}
                  {itensSemGradeDefinida.map((i) => {
                    const nome = `destino-variacao-${i.id}`
                    return (
                      <Field key={i.id}>
                        <FieldLabel htmlFor={nome}>
                          Variação de {i.produtos.nome}
                        </FieldLabel>
                        <NativeSelect
                          id={nome}
                          name={nome}
                          required
                          defaultValue=""
                        >
                          <NativeSelectOption value="">
                            Selecione a variação
                          </NativeSelectOption>
                          {i.produtos.produto_variacoes
                            .filter(
                              (v) =>
                                v.elegivel &&
                                (i.id_cor === null || i.id_cor === v.id_cor) &&
                                (i.id_tamanho === null ||
                                  i.id_tamanho === v.id_tamanho),
                            )
                            .map((v) => (
                              <NativeSelectOption key={v.id} value={v.id}>
                                {grade(v)}
                              </NativeSelectOption>
                            ))}
                        </NativeSelect>
                      </Field>
                    )
                  })}
                  <Campo
                    nome="destino-motivo"
                    titulo="Motivo da regularização"
                  />
                  <Button type="submit">Salvar regularização</Button>
                </fieldset>
              </form>
            )}
          <AcoesFluxoOrdem
            ordem={ordem}
            comSnapshot={comSnapshot}
            faltaDestino={faltaDestino}
            podeConcluir={podeConcluir}
            bloqueado={bloqueado}
            setores={opcoes.setores}
            enviar={enviar}
          />
          <h3 className="font-semibold">Consumo real dos materiais</h3>
          <p>
            Para encerrar um consumo integral já registrado, selecione a reserva
            atendida, informe zero, marque encerramento e justifique. Nenhuma
            nova baixa será criada. Material não utilizado: informe zero,
            encerre o consumo e justifique. A sobra será liberada sem saída
            física.
          </p>
          {ordem.necessidade_producao.map((n) => (
            <p key={n.id_produto}>
              {opcoes.produtos.find((p) => p.id === n.id_produto)?.nome ??
                `Material ${n.id_produto}`}{" "}
              · previsto {formatarQuantidade(n.quantidade_necessaria)} ·
              reservado {formatarQuantidade(n.quantidade_reservada)} · consumido{" "}
              {formatarQuantidade(n.quantidade_consumida)} ·{" "}
              {n.consumo_confirmado_em
                ? "Consumo encerrado"
                : "Consumo pendente"}
            </p>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const motivo = String(fd.get("motivo-divergencia") ?? "").trim()
              const validado = consumoSchema.safeParse({
                idReserva: Number(reservaConsumo),
                quantidade: String(fd.get("consumir-quantidade")).replace(
                  ",",
                  ".",
                ),
                concluirConsumo: fd.get("consumo-concluido") === "on",
                ...(motivo ? { motivoDivergencia: motivo } : {}),
              })
              if (!validado.success) {
                toast.error(
                  "Informe o consumo com até três casas decimais. Zero exige encerramento e motivo.",
                )
                return
              }
              if (
                !consumoSelecionado ||
                (consumoSelecionado.status !== "ATIVA" &&
                  Number(validado.data.quantidade) > 0)
              ) {
                toast.error(
                  "Esta reserva já foi consumida. Informe zero explicitamente para encerrar sem nova saída.",
                )
                return
              }
              void enviar(
                `/api/ordem_producao/${ordem.id}/consumos`,
                validado.data,
              )
            }}
          >
            <fieldset
              disabled={bloqueado}
              className="grid gap-3 sm:grid-cols-2"
            >
              <Seletor
                titulo="Reserva do material consumido"
                valor={reservaConsumo}
                alterar={setReservaConsumo}
                opcoes={reservasConsumo.map((r) => ({
                  value: String(r.id),
                  label: `${r.nomeItem} · reserva ${r.id} · consumido ${formatarQuantidade(r.quantidade_consumida)} · restante ${formatarMilesimos(saldoReserva(r))}${r.status === "ATENDIDA" ? " · somente encerramento" : ""}`,
                }))}
              />
              <Campo
                nome="consumir-quantidade"
                titulo="Quantidade efetivamente consumida"
              />
              <Campo
                nome="motivo-divergencia"
                titulo="Motivo da diferença em relação ao previsto"
                obrigatorio={false}
              />
              <label className="flex items-center gap-2">
                <input type="checkbox" name="consumo-concluido" />
                Este registro encerra o consumo deste material; liberar a sobra
                reservada
              </label>
              <Button
                type="submit"
                disabled={
                  !consumoSelecionado ||
                  !["EM_PRODUCAO", "PAUSADA"].includes(ordem.status)
                }
              >
                {consumoSelecionado?.status === "ATENDIDA"
                  ? "Encerrar consumo já realizado"
                  : "Registrar consumo e saída do material"}
              </Button>
            </fieldset>
          </form>
          <h3 className="font-semibold">
            Produção efetiva e entrada de produtos prontos
          </h3>
          <p>
            Destino físico configurado da fábrica:{" "}
            {opcoes.locais.find((l) => l.id === ordem.id_local_estoque)?.nome ??
              "Defina o local da OP antes de iniciar"}
            . A chegada à loja depende de transferência recebida.
          </p>
          {ordem.ordem_producao_item.map((i) => (
            <form
              key={`${i.id}:${i.quantidade_produzida}`}
              onSubmit={(e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                void enviar(
                  `/api/ordem_producao/${ordem.id}/itens/${i.id}/producao`,
                  {
                    quantidade_produzida: String(
                      fd.get(`produzido-${i.id}`),
                    ).replace(",", "."),
                    quantidade_esperada: i.quantidade_produzida,
                  },
                  "PUT",
                )
              }}
            >
              <fieldset
                disabled={
                  bloqueado ||
                  ordem.status !== "EM_PRODUCAO" ||
                  (comSnapshot &&
                    ordem.ordem_producao_fluxo_setor.at(-1)?.status !==
                      "EM_PRODUCAO")
                }
                className="flex flex-wrap items-end gap-3"
              >
                <Campo
                  nome={`produzido-${i.id}`}
                  titulo={`${i.produtos.nome} · ${i.produtos.unidade} · produção total efetiva`}
                  inicial={i.quantidade_produzida}
                />
                <Button type="submit">Registrar quantidade produzida</Button>
              </fieldset>
            </form>
          ))}
          <p>
            Ao concluir a última etapa ou a OP, os produtos efetivamente
            produzidos entram no local da fábrica. Consumos pendentes impedem a
            confirmação.
          </p>
          {!comSnapshot && (
            <Button
              disabled={bloqueado || !podeConcluir || temProximoSetor(ordem)}
              onClick={() =>
                enviar(`/api/ordens-producao/${ordem.id}/encerrar`, {
                  statusEsperado: ordem.status,
                  setorEsperado: ordem.id_setor,
                })
              }
            >
              Encerrar OP e registrar entrada na fábrica
            </Button>
          )}
        </>
      )}
    </div>
  )
}

function FecharPedido({
  pedido,
  requisitar,
  revisao,
  bloqueado,
  enviar,
}: {
  pedido: Pedido
  requisitar: Api
  revisao: number
  bloqueado: boolean
  enviar: Enviar
}) {
  const [categoria, setCategoria] = useState("")
  const consulta = useConsulta<{ id: number; nome: string }[]>(
    pedido.pedido_cliente_fechamento.length
      ? null
      : `/api/pedidos/${pedido.id}/opcoes-fechamento`,
    requisitar,
    revisao,
  )
  if (pedido.pedido_cliente_fechamento.length)
    return (
      <p>
        Fechamento registrado.{" "}
        <Link className="underline" href="/financeiro/contas-receber">
          Consultar parcelas e registrar recebimentos
        </Link>
      </p>
    )
  return (
    <Caixa titulo="Fechamento e geração de parcelas">
      <p>
        O recebimento físico está confirmado. Fechar gera os títulos a receber e
        mantém o estoque já movimentado na entrega.
      </p>
      {consulta.erro && <p role="alert">{consulta.erro}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          void enviar(
            `/api/pedidos/${pedido.id}/fechar`,
            {
              idCategoriaFinanceira: Number(categoria),
              vencimentos: String(fd.get("vencimentos-fechamento"))
                .split(/\s+/)
                .filter(Boolean),
            },
            "POST",
            { "If-Match": `"${pedido.versao}"` },
          )
        }}
      >
        <fieldset disabled={bloqueado} className="space-y-3">
          <Seletor
            titulo="Categoria da receita"
            valor={categoria}
            alterar={setCategoria}
            opcoes={(consulta.dados ?? []).map((c) => ({
              value: String(c.id),
              label: c.nome,
            }))}
          />
          <Field>
            <FieldLabel htmlFor="vencimentos-fechamento">
              Vencimentos acordados, um por linha (AAAA-MM-DD)
            </FieldLabel>
            <Textarea
              id="vencimentos-fechamento"
              name="vencimentos-fechamento"
              placeholder="2026-12-10"
              required
            />
          </Field>
          <Button type="submit" disabled={!categoria}>
            Confirmar fechamento e gerar parcelas
          </Button>
        </fieldset>
      </form>
    </Caixa>
  )
}

type Transferencia = {
  id: number
  id_produto: number
  id_variacao: number | null
  quantidade: string
  status: "ENVIADA" | "RECEBIDA"
  produto: { nome: string; unidade: string } | null
  variacao: { cor: string | null; tamanho: string | null } | null
  origem: { local: string; setor: string | null }
  destino: { local: string; setor: string | null }
  data_envio: string
  data_recebimento: string | null
  enviadoPor: string
  recebidoPor: string | null
}

type ConfirmacaoTransferencia = { id: number; recebida: boolean }

function identificacaoVariacao(r: Transferencia) {
  if (r.id_variacao === null) return "Sem variação"
  const dimensoes = [r.variacao?.cor, r.variacao?.tamanho].filter(Boolean)
  return dimensoes.join(" / ") || `Variação #${r.id_variacao}`
}

function localESetor(posicao: Transferencia["origem"]) {
  return [posicao.local, posicao.setor].filter(Boolean).join(" · ")
}

function Transferencias({
  requisitar,
  revisao,
  opcoes,
  atualizandoOpcoes,
  bloqueado,
  enviar,
  confirmacao,
  versaoEnvio,
}: {
  requisitar: Api
  revisao: number
  opcoes: Opcoes
  atualizandoOpcoes: boolean
  bloqueado: boolean
  enviar: Enviar
  confirmacao: ConfirmacaoTransferencia | null
  versaoEnvio: number
}) {
  const [pagina, setPagina] = useState(1)
  const [status, setStatus] = useState("")
  const [destino, setDestino] = useState("")
  const [idFiltro, setIdFiltro] = useState<number | null>(null)
  const [conferencia, setConferencia] = useState<Transferencia | null>(null)
  const [contagem, setContagem] = useState("")
  const params = new URLSearchParams({
    pagina: String(pagina),
    limite: "25",
    ...(idFiltro
      ? { idTransferencia: String(idFiltro) }
      : {
          ...(status && { status }),
          ...(destino && { idLocalDestino: destino }),
        }),
  })
  const consulta = useConsulta<{
    dados: Transferencia[]
    totalPaginas: number
    podeMovimentar: boolean
  }>(`/api/estoque/transferencias?${params}`, requisitar, revisao, true)
  const historico =
    !consulta.carregando && !consulta.erro ? consulta.dados : null
  const podeMovimentar = consulta.dados?.podeMovimentar === true
  const indisponivel = bloqueado || !historico?.podeMovimentar
  const contada = receberTransferenciaSchema.safeParse({
    quantidade: contagem.trim().replace(",", "."),
  })
  const diferenca =
    conferencia && contada.success
      ? milesimos(contada.data.quantidade) - milesimos(conferencia.quantidade)
      : null

  return (
    <Caixa titulo="Transferência física entre fábrica e loja">
      <p className="text-sm text-muted-foreground">
        O envio baixa a origem. As peças entram na loja após a conferência
        integral.
      </p>
      {podeMovimentar && (
        <FormularioTransferencia
          key={versaoEnvio}
          opcoes={opcoes}
          bloqueado={indisponivel || atualizandoOpcoes}
          enviar={enviar}
        />
      )}
      {historico && !historico.podeMovimentar && (
        <p>
          Você pode consultar as transferências. Enviar e receber exigem edição
          de estoque.
        </p>
      )}
      {confirmacao && (
        <Alert>
          <AlertDescription>
            {confirmacao.recebida
              ? `Transferência #${confirmacao.id} recebida no destino`
              : `Envio da transferência #${confirmacao.id} confirmado`}
            .
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setIdFiltro(confirmacao.id)
                setPagina(1)
              }}
            >
              Ver transferência #{confirmacao.id}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <h3 className="text-base font-semibold">Histórico de transferências</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="transferencias-situacao">Situação</FieldLabel>
          <NativeSelect
            id="transferencias-situacao"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              setIdFiltro(null)
              setPagina(1)
            }}
          >
            <NativeSelectOption value="">Todas</NativeSelectOption>
            <NativeSelectOption value="ENVIADA">Em trânsito</NativeSelectOption>
            <NativeSelectOption value="RECEBIDA">Recebidas</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="transferencias-destino">
            Filtrar por destino
          </FieldLabel>
          <NativeSelect
            id="transferencias-destino"
            value={destino}
            onChange={(e) => {
              setDestino(e.target.value)
              setIdFiltro(null)
              setPagina(1)
            }}
          >
            <NativeSelectOption value="">Todos os destinos</NativeSelectOption>
            {opcoes.locais.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.nome}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {idFiltro !== null && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setIdFiltro(null)
            setDestino("")
            setStatus("")
            setPagina(1)
          }}
        >
          Limpar filtro de transferência #{idFiltro}
        </Button>
      )}
      {consulta.carregando && <p role="status">Carregando transferências…</p>}
      {consulta.erro && <p role="alert">{consulta.erro}</p>}
      {historico &&
        (historico.dados.length === 0 ? (
          <p>Nenhuma transferência encontrada para os filtros selecionados.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto e variação</TableHead>
                <TableHead>Origem → destino</TableHead>
                <TableHead>Quantidade e situação</TableHead>
                <TableHead>Conferência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.dados.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p>
                      #{r.id} · {r.produto?.nome ?? `Produto #${r.id_produto}`}
                    </p>
                    <p className="text-muted-foreground">
                      {identificacaoVariacao(r)}
                    </p>
                  </TableCell>
                  <TableCell>
                    {localESetor(r.origem)} → {localESetor(r.destino)}
                  </TableCell>
                  <TableCell>
                    <p>
                      {formatarMilesimos(milesimos(r.quantidade))}{" "}
                      {r.produto?.unidade} ·{" "}
                      {r.status === "ENVIADA" ? "Em trânsito" : "Recebida"}
                    </p>
                    <p className="text-muted-foreground">
                      Enviada por {r.enviadoPor} em{" "}
                      {formatarDataHora(new Date(r.data_envio))}
                    </p>
                    {r.data_recebimento && (
                      <p className="text-muted-foreground">
                        Entrada em{" "}
                        {formatarDataHora(new Date(r.data_recebimento))}
                        {r.recebidoPor && ` · ${r.recebidoPor}`}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.status === "ENVIADA" && podeMovimentar && (
                      <Button
                        type="button"
                        disabled={indisponivel}
                        onClick={() => {
                          setConferencia(r)
                          setContagem("")
                        }}
                      >
                        Conferir chegada
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}
      {historico && (pagina > 1 || historico.totalPaginas > 1) && (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </Button>
          <span>Página {pagina}</span>
          <Button
            type="button"
            variant="outline"
            disabled={pagina >= historico.totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
      <Dialog
        open={conferencia !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setConferencia(null)
        }}
      >
        {conferencia && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Conferir transferência #{conferencia.id}
              </DialogTitle>
              <DialogDescription>
                Informe a quantidade que chegou fisicamente ao destino.
              </DialogDescription>
            </DialogHeader>
            <p>
              {conferencia.produto?.nome ??
                `Produto #${conferencia.id_produto}`}{" "}
              · {identificacaoVariacao(conferencia)}
            </p>
            <p>
              {localESetor(conferencia.origem)} →{" "}
              {localESetor(conferencia.destino)}
            </p>
            <p>
              Esperado: {formatarMilesimos(milesimos(conferencia.quantidade))}{" "}
              {conferencia.produto?.unidade}
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (indisponivel || diferenca !== zero || !contada.success)
                  return
                const id = conferencia.id
                setConferencia(null)
                void enviar(
                  `/api/estoque/transferencias/${id}/receber`,
                  contada.data,
                )
              }}
            >
              <Field>
                <FieldLabel htmlFor="transferencia-contagem">
                  Quantidade contada
                </FieldLabel>
                <Input
                  id="transferencia-contagem"
                  inputMode="decimal"
                  value={contagem}
                  onChange={(e) => setContagem(e.target.value)}
                  disabled={indisponivel}
                  required
                />
              </Field>
              {contagem && !contada.success && (
                <p role="alert">
                  Informe uma quantidade válida com até três casas decimais.
                </p>
              )}
              {diferenca !== null && diferenca !== zero && (
                <p role="alert">
                  Diferença: {formatarMilesimos(diferenca)}{" "}
                  {conferencia.produto?.unidade}. A transferência continua em
                  trânsito. Confira novamente ou siga o procedimento de
                  regularização da equipe.
                </p>
              )}
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={indisponivel || diferenca !== zero}
                >
                  Confirmar recebimento no destino
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </Caixa>
  )
}

function FormularioTransferencia({
  opcoes,
  bloqueado,
  enviar,
}: {
  opcoes: Opcoes
  bloqueado: boolean
  enviar: Enviar
}) {
  const [produto, setProduto] = useState("")
  const [variacao, setVariacao] = useState("")
  const [origem, setOrigem] = useState("")
  const [destino, setDestino] = useState("")
  const [setor, setSetor] = useState("")
  const [quantidade, setQuantidade] = useState("")
  const [observacao, setObservacao] = useState("")
  const [confirmar, setConfirmar] = useState(false)
  const item = opcoes.produtos.find((p) => p.id === Number(produto))
  const variante = item?.produto_variacoes.find(
    (v) => v.id === Number(variacao),
  )
  const posicoes = (item?.estoque ?? []).filter(
    (p) =>
      opcoes.locais.some((l) => l.id === p.id_local_estoque) &&
      opcoes.setores.some((s) => s.id === p.id_setor),
  )
  const chavePosicao = (p: Produto["estoque"][number]) =>
    `${p.id_local_estoque}:${p.id_setor}`
  const posicao = posicoes.find((p) => chavePosicao(p) === origem)
  const localOrigem = opcoes.locais.find(
    (p) => p.id === posicao?.id_local_estoque,
  )
  const setorOrigem = opcoes.setores.find((s) => s.id === posicao?.id_setor)
  const destinos = opcoes.locais.filter(
    (p) => p.id !== posicao?.id_local_estoque,
  )
  const localDestino = destinos.find((p) => p.id === Number(destino))
  const setoresDestino = opcoes.setores.filter(
    (s) =>
      localDestino &&
      !(item?.estoque ?? []).some(
        (p) =>
          (p.id_setor === s.id) !== (p.id_local_estoque === localDestino.id),
      ),
  )
  const setorDestino = setoresDestino.find((s) => s.id === Number(setor))
  const saldo = posicao && saldoTransferivel(posicao, variante?.id)
  const qtd = quantidadeOperacional.safeParse(
    quantidade.trim().replace(",", "."),
  )
  const permiteVariacao =
    !item?.possui_grade || !!variante || variacao === "sem-variacao"
  const input =
    item &&
    posicao &&
    localDestino &&
    setorDestino &&
    permiteVariacao &&
    saldo &&
    qtd.success &&
    milesimos(qtd.data) <= saldo.disponivel &&
    observacao.trim()
      ? {
          idProduto: item.id,
          ...(variante && { idVariacao: variante.id }),
          idLocalOrigem: posicao.id_local_estoque,
          idSetorOrigem: posicao.id_setor,
          idLocalDestino: localDestino.id,
          idSetorDestino: setorDestino.id,
          quantidade: qtd.data,
          observacao: observacao.trim(),
        }
      : null

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (input && !bloqueado) setConfirmar(true)
        }}
      >
        <fieldset disabled={bloqueado} className="grid gap-3 sm:grid-cols-2">
          <Seletor
            titulo="Produto para enviar"
            valor={produto}
            alterar={(v) => {
              setProduto(v)
              setVariacao("")
              setOrigem("")
              setDestino("")
              setSetor("")
            }}
            opcoes={opcoes.produtos.map((p) => ({
              value: String(p.id),
              label: `${p.nome} · ${p.unidade}`,
            }))}
          />
          {item?.possui_grade && (
            <Seletor
              titulo="Variação do envio"
              valor={variacao}
              alterar={(v) => {
                setVariacao(v)
                setOrigem("")
              }}
              opcoes={[
                ...item.produto_variacoes.map((v) => ({
                  value: String(v.id),
                  label: grade(v),
                })),
                { value: "sem-variacao", label: "Saldo sem variação" },
              ]}
            />
          )}
          <Seletor
            titulo="Posição de origem"
            valor={origem}
            alterar={(v) => {
              setOrigem(v)
              if (v.split(":")[0] === destino) {
                setDestino("")
                setSetor("")
              }
            }}
            opcoes={posicoes.map((p) => ({
              value: chavePosicao(p),
              label: `${opcoes.locais.find((l) => l.id === p.id_local_estoque)?.nome} · ${opcoes.setores.find((s) => s.id === p.id_setor)?.nome}`,
            }))}
          />
          <Seletor
            titulo="Local de destino"
            valor={destino}
            alterar={(v) => {
              setDestino(v)
              setSetor("")
            }}
            opcoes={destinos.map((p) => ({
              value: String(p.id),
              label: p.nome,
            }))}
          />
          <Seletor
            titulo="Setor de destino"
            valor={setor}
            alterar={setSetor}
            opcoes={setoresDestino.map((p) => ({
              value: String(p.id),
              label: p.nome,
            }))}
          />
          {saldo && permiteVariacao && (
            <p className="self-end">
              Físico: {formatarMilesimos(saldo.fisico)} · Reservado:{" "}
              {formatarMilesimos(saldo.reservado)} · Disponível:{" "}
              {formatarMilesimos(saldo.disponivel)} {item?.unidade}
            </p>
          )}
          <Field>
            <FieldLabel htmlFor="transferir-quantidade">
              Quantidade enviada
            </FieldLabel>
            <Input
              id="transferir-quantidade"
              inputMode="decimal"
              value={quantidade}
              required
              onChange={(e) => setQuantidade(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="transferir-observacao">
              Motivo do envio
            </FieldLabel>
            <Input
              id="transferir-observacao"
              maxLength={255}
              value={observacao}
              required
              onChange={(e) => setObservacao(e.target.value)}
            />
          </Field>
          {quantidade && !qtd.success && (
            <p role="alert">
              Informe uma quantidade positiva com até três casas decimais.
            </p>
          )}
          {saldo &&
            qtd.success &&
            permiteVariacao &&
            milesimos(qtd.data) > saldo.disponivel && (
              <p role="alert">
                Quantidade maior que o saldo disponível dessa posição e
                variação.
              </p>
            )}
          <Button type="submit" disabled={!input || bloqueado}>
            Revisar envio
          </Button>
        </fieldset>
      </form>
      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar envio físico</DialogTitle>
            <DialogDescription>
              Confira os dados antes de baixar as peças da fábrica.
            </DialogDescription>
          </DialogHeader>
          {input && (
            <>
              <p>
                {item?.nome} · {variante ? grade(variante) : "Sem variação"}
              </p>
              <p>
                {localOrigem?.nome} · {setorOrigem?.nome} → {localDestino?.nome}{" "}
                · {setorDestino?.nome}
              </p>
              <p>
                {formatarMilesimos(milesimos(input.quantidade))} {item?.unidade}
              </p>
            </>
          )}
          <DialogFooter>
            <Button
              type="button"
              disabled={!input || bloqueado}
              onClick={() => {
                if (!input || bloqueado) return
                setConfirmar(false)
                void enviar("/api/estoque/transferencias/enviar", input)
              }}
            >
              Confirmar envio físico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

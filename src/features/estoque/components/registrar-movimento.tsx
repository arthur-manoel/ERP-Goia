"use client"
import { useRef, useState, type FormEvent } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { lerRespostaOperacao } from "@/features/erp/resposta-operacao"
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
import { NativeSelect } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import { formatarQuantidade } from "@/lib/formatacao"
import {
  ajusteSchema,
  movimentoSchema,
} from "@/modules/movimentacoes-estoque/movimentacoes-estoque.schema"
import {
  useConsultaEstoque,
  type Catalogo,
  type Saldo,
} from "../movimentos-api"

const operacoes = {
  entradas: "Entrada",
  saidas: "Saída",
  ajustes: "Ajuste de inventário",
} as const
type Rota = keyof typeof operacoes
type Tentativa = { rota: Rota; chave: string; body: string }
const semVariacao = "sem-variacao"
function lerPendente(key: string) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null")
    return value &&
      Object.hasOwn(operacoes, value.rota) &&
      typeof value.chave === "string" &&
      typeof value.body === "string"
      ? (value as Tentativa)
      : null
  } catch {
    return null
  }
}

function dadosDaTentativa(tentativa: Tentativa) {
  try {
    const body: unknown = JSON.parse(tentativa.body)
    const schema = tentativa.rota === "ajustes" ? ajusteSchema : movimentoSchema
    const resultado = schema.safeParse(body)
    return resultado.success ? resultado.data : null
  } catch {
    return null
  }
}

export function RegistrarMovimento({
  catalogo,
  atualizar,
}: {
  catalogo: Catalogo
  atualizar: () => void
}) {
  const { requisitar, usuario, empresa, chaveEmpresa, conferirEmpresa } =
    useAutenticacao()
  const storage = `erp-estoque-manual:${usuario?.id}:${empresa?.id}`
  const [pendente, setPendente] = useState<Tentativa | null>(() =>
    lerPendente(storage),
  )
  const [aberto, setAberto] = useState(false)
  const [rota, setRota] = useState<Rota>(
    catalogo.permissoes.criar ? "entradas" : "ajustes",
  )
  const [produto, setProduto] = useState("")
  const [local, setLocal] = useState("")
  const [setor, setSetor] = useState("")
  const [variacao, setVariacao] = useState("")
  const [termoGrade, setTermoGrade] = useState("")
  const [buscaGrade, setBuscaGrade] = useState("")
  const [quantidade, setQuantidade] = useState("")
  const [observacao, setObservacao] = useState("")
  const [revisao, setRevisao] = useState(0)
  const [erro, setErro] = useState("")
  const [campos, setCampos] = useState<Record<string, string>>({})
  const [ocupado, setOcupado] = useState(false)
  const trava = useRef(false)
  const consulta = useConsultaEstoque<Saldo>(
    aberto && produto && local && !pendente
      ? `/api/estoque/saldo?idProduto=${produto}&idLocalEstoque=${local}`
      : null,
    revisao,
  )
  const saldo = consulta?.dados
  const exigeCatalogoGrade = rota !== "ajustes" && !!produto
  const filtrosGrade = new URLSearchParams({
    idProduto: produto,
    ...(buscaGrade && { variacao: buscaGrade }),
  })
  const consultaGrade = useConsultaEstoque<Catalogo>(
    aberto && exigeCatalogoGrade && !pendente
      ? `/api/estoque/movimentacoes/catalogo?${filtrosGrade}`
      : null,
    revisao,
  )
  const grade = consultaGrade?.dados
  const variacoes = (grade?.variacoes ?? []).filter((v) => v.ativo)
  const temIdVariacao = !!variacao && variacao !== semVariacao
  const selecionada = variacoes.some((v) => v.id === Number(variacao))
  const gradePrecisaEscolha =
    variacoes.length > 0 ||
    !!grade?.excedeu.variacao ||
    !!buscaGrade ||
    temIdVariacao
  const gradeDisponivel =
    !exigeCatalogoGrade ||
    (!!grade &&
      (!gradePrecisaEscolha || variacao === semVariacao || selecionada))
  const posicaoSetor = saldo?.idSetor ? String(saldo.idSetor) : setor
  const dadosPendentes = pendente && dadosDaTentativa(pendente)

  function buscarVariacoes() {
    setVariacao("")
    setBuscaGrade(termoGrade.trim())
  }

  function descartar(tentativa: Tentativa) {
    if (lerPendente(storage)?.chave === tentativa.chave)
      sessionStorage.removeItem(storage)
    setPendente((atual) => (atual?.chave === tentativa.chave ? null : atual))
  }

  async function enviar(tentativa: Tentativa, recuperando = false) {
    if (trava.current) return
    try {
      conferirEmpresa(chaveEmpresa)
      const existente = lerPendente(storage)
      if (existente && existente.chave !== tentativa.chave) {
        setPendente(existente)
        setErro("Recupere a movimentação já iniciada nesta sessão.")
        return
      }
      sessionStorage.setItem(storage, JSON.stringify(tentativa))
    } catch {
      setErro("Não foi possível guardar a confirmação nesta sessão.")
      return
    }
    trava.current = true
    setPendente(tentativa)
    setOcupado(true)
    setErro("")
    try {
      const r = await requisitar(`/api/estoque/${tentativa.rota}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": tentativa.chave,
        },
        body: tentativa.body,
      })
      // Um replay só termina com o resultado persistido para a mesma chave.
      const confirmacao =
        recuperando && !r.ok
          ? await r
              .clone()
              .json()
              .catch(() => null)
          : null
      const recusaConfirmada =
        confirmacao?.code === "ESTOQUE_RECUSADO" &&
        [400, 404, 409].includes(r.status)
      const resultado = await lerRespostaOperacao(r, () => {
        conferirEmpresa(chaveEmpresa)
        if (!recuperando || recusaConfirmada) descartar(tentativa)
      })
      conferirEmpresa(chaveEmpresa)
      if (!r.ok) {
        setErro(
          recuperando && !recusaConfirmada
            ? `${resultado.error ?? "Confirmação inconclusiva."} A tentativa continua guardada para recuperação.`
            : (resultado.error ??
                "Confirmação inconclusiva. Recupere a mesma movimentação."),
        )
        return
      }
      if (
        !Number.isInteger(resultado.idMovimentacao) ||
        typeof resultado.saldoAtual !== "string"
      )
        throw new Error("Confirmação inválida")
      descartar(tentativa)
      setAberto(false)
      setProduto("")
      setLocal("")
      setSetor("")
      setVariacao("")
      setTermoGrade("")
      setBuscaGrade("")
      setQuantidade("")
      setObservacao("")
      setCampos({})
      setRevisao((v) => v + 1)
      atualizar()
      toast.success(
        `Movimento #${resultado.idMovimentacao} confirmado. Saldo agregado ${formatarQuantidade(resultado.saldoAtual)}.`,
      )
    } catch {
      try {
        conferirEmpresa(chaveEmpresa)
        setErro(
          "Resposta interrompida. Recupere a mesma movimentação para confirmar o resultado.",
        )
      } catch {
        /* A tentativa permanece no contexto original. */
      }
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }

  function confirmar(e: FormEvent) {
    e.preventDefault()
    if (!saldo || !gradeDisponivel || pendente || trava.current) return
    const base = {
      idProduto: Number(produto),
      idLocalEstoque: Number(local),
      idSetor: Number(posicaoSetor),
      observacao,
    }
    const q = quantidade.trim().replace(",", ".")
    const v =
      rota === "ajustes"
        ? ajusteSchema.safeParse({
            ...base,
            saldoNovo: q,
            saldoEsperado: saldo.saldoArmazenado,
          })
        : movimentoSchema.safeParse({
            ...base,
            quantidade: q,
            ...(temIdVariacao ? { idVariacao: Number(variacao) } : {}),
          })
    if (!v.success) {
      setCampos(
        Object.fromEntries(v.error.issues.map((i) => [i.path[0], i.message])),
      )
      return
    }
    setCampos({})
    void enviar({
      rota,
      chave: crypto.randomUUID(),
      body: JSON.stringify(v.data),
    })
  }
  const opcoes = (lista: { id: number; nome: string }[]) =>
    lista.map((x) => (
      <option key={x.id} value={x.id}>
        {x.nome}
      </option>
    ))
  const podeCriar = catalogo.permissoes.criar || catalogo.permissoes.editar
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {(podeCriar || pendente) && (
          <Button onClick={() => setAberto(true)}>
            {pendente ? "Recuperar movimentação pendente" : "Nova movimentação"}
          </Button>
        )}
        <Button variant="outline" render={<Link href="/estoque/reservas" />}>
          Transferências e reservas
        </Button>
      </div>
      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          if (!trava.current) setAberto(v)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {pendente
                ? "Confirmar movimentação pendente"
                : "Nova movimentação"}
            </DialogTitle>
            <DialogDescription>
              Estoque físico por produto e local.
            </DialogDescription>
          </DialogHeader>
          {pendente ? (
            <div className="space-y-3">
              <p>{operacoes[pendente.rota]} aguardando confirmação.</p>
              {dadosPendentes && (
                <p>
                  Produto #{dadosPendentes.idProduto} · Local #
                  {dadosPendentes.idLocalEstoque} · Setor #
                  {dadosPendentes.idSetor}
                  {" · "}
                  {"saldoNovo" in dadosPendentes
                    ? `Novo saldo ${formatarQuantidade(dadosPendentes.saldoNovo)}`
                    : `Quantidade ${formatarQuantidade(dadosPendentes.quantidade)}`}
                  {dadosPendentes.idVariacao &&
                    ` · Variação #${dadosPendentes.idVariacao}`}
                  {" · "}
                  {dadosPendentes.observacao}
                </p>
              )}
              <p>
                A recuperação reenvia a mesma operação. Se ela já foi gravada, o
                servidor devolve o resultado anterior.
              </p>
              {erro && (
                <p role="alert" className="text-destructive">
                  {erro}
                </p>
              )}
              <Button
                disabled={ocupado}
                onClick={() => void enviar(pendente, true)}
              >
                Recuperar mesma movimentação
              </Button>
            </div>
          ) : (
            <form noValidate className="space-y-4" onSubmit={confirmar}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  Operação
                  <NativeSelect
                    aria-label="Operação"
                    value={rota}
                    onChange={(e) => {
                      setRota(e.target.value as Rota)
                      setCampos({})
                      setErro("")
                    }}
                  >
                    {catalogo.permissoes.criar && (
                      <>
                        <option value="entradas">Entrada</option>
                        <option value="saidas">Saída</option>
                      </>
                    )}
                    {catalogo.permissoes.editar && (
                      <option value="ajustes">Ajuste de inventário</option>
                    )}
                  </NativeSelect>
                </label>
                <label className="grid gap-1 text-sm">
                  Produto da movimentação
                  <NativeSelect
                    aria-label="Produto da movimentação"
                    value={produto}
                    onChange={(e) => {
                      setProduto(e.target.value)
                      setVariacao("")
                      setTermoGrade("")
                      setBuscaGrade("")
                      setSetor("")
                    }}
                  >
                    <option value="">Selecione</option>
                    {opcoes(
                      catalogo.produtos
                        .filter((p) => p.ativo)
                        .map((p) => ({
                          ...p,
                          nome: `${p.nome} · ${p.codigo ?? "#" + p.id}`,
                        })),
                    )}
                  </NativeSelect>
                </label>
                <label className="grid gap-1 text-sm">
                  Local da movimentação
                  <NativeSelect
                    aria-label="Local da movimentação"
                    value={local}
                    onChange={(e) => {
                      setLocal(e.target.value)
                      setSetor("")
                    }}
                  >
                    <option value="">Selecione</option>
                    {opcoes(catalogo.locais.filter((l) => l.ativo))}
                  </NativeSelect>
                </label>
                <label className="grid gap-1 text-sm">
                  Setor da movimentação
                  <NativeSelect
                    aria-label="Setor da movimentação"
                    value={posicaoSetor}
                    disabled={!!saldo?.idSetor}
                    onChange={(e) => setSetor(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {saldo?.idSetor &&
                      !catalogo.setores.some((s) => s.id === saldo.idSetor) && (
                        <option value={saldo.idSetor}>
                          Setor #{saldo.idSetor}
                        </option>
                      )}
                    {opcoes(
                      catalogo.setores.filter(
                        (s) => s.ativo || s.id === saldo?.idSetor,
                      ),
                    )}
                  </NativeSelect>
                  {campos.idSetor && (
                    <span className="text-destructive">{campos.idSetor}</span>
                  )}
                </label>
                {exigeCatalogoGrade && (gradePrecisaEscolha || termoGrade) && (
                  <div className="space-y-2">
                    <label className="grid gap-1 text-sm">
                      Buscar cor ou tamanho da movimentação
                      <Input
                        value={termoGrade}
                        maxLength={100}
                        onChange={(e) => setTermoGrade(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            buscarVariacoes()
                          }
                        }}
                      />
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={buscarVariacoes}
                    >
                      Buscar variações
                    </Button>
                    {grade?.excedeu.variacao && (
                      <p role="status">
                        Há mais de 500 variações. Refine a busca.
                      </p>
                    )}
                    {grade && buscaGrade && variacoes.length === 0 && (
                      <p role="status">
                        Nenhuma variação encontrada para a busca.
                      </p>
                    )}
                  </div>
                )}
                {exigeCatalogoGrade && gradePrecisaEscolha && (
                  <label className="grid gap-1 text-sm">
                    Variação da movimentação
                    <NativeSelect
                      aria-label="Variação da movimentação"
                      value={variacao}
                      disabled={!grade}
                      onChange={(e) => setVariacao(e.target.value)}
                    >
                      <option value="">Selecione</option>
                      <option value={semVariacao}>
                        Sem classificação por variação
                      </option>
                      {opcoes(variacoes)}
                    </NativeSelect>
                  </label>
                )}
                {exigeCatalogoGrade && !consultaGrade && (
                  <p role="status">Carregando variações do produto…</p>
                )}
                {exigeCatalogoGrade &&
                  grade &&
                  temIdVariacao &&
                  !selecionada && (
                    <p role="alert">
                      A variação selecionada ficou indisponível. Escolha outra
                      opção.
                    </p>
                  )}
                {consultaGrade?.erro && (
                  <p role="alert" className="text-destructive">
                    {consultaGrade.erro} Atualize o saldo e as variações.
                  </p>
                )}
                <label className="grid gap-1 text-sm">
                  {rota === "ajustes" ? "Novo saldo físico" : "Quantidade"}
                  <Input
                    inputMode="decimal"
                    value={quantidade}
                    aria-label={
                      rota === "ajustes" ? "Novo saldo físico" : "Quantidade"
                    }
                    aria-invalid={!!(campos.quantidade || campos.saldoNovo)}
                    onChange={(e) => setQuantidade(e.target.value)}
                  />
                  {(campos.quantidade || campos.saldoNovo) && (
                    <span className="text-destructive">
                      {campos.quantidade || campos.saldoNovo}
                    </span>
                  )}
                </label>
              </div>
              {saldo && (
                <div className="rounded-md border p-3 text-sm">
                  <p>
                    Saldo físico agregado{" "}
                    {formatarQuantidade(saldo.saldoArmazenado)} · Reservado{" "}
                    {formatarQuantidade(saldo.quantidadeReservada)}
                  </p>
                  {saldo.precisaAbertura && (
                    <p>
                      A primeira movimentação registra a abertura do saldo
                      legado.
                    </p>
                  )}
                  {!saldo.consistente && !saldo.precisaAbertura && (
                    <p>
                      O livro diverge do saldo físico. O serviço conferirá a
                      posição antes de gravar.
                    </p>
                  )}
                </div>
              )}
              {consulta?.erro && (
                <p role="alert" className="text-destructive">
                  {consulta.erro}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={!produto}
                onClick={() => setRevisao((v) => v + 1)}
              >
                Atualizar saldo e variações
              </Button>
              <label className="grid gap-1 text-sm">
                Motivo da movimentação
                <Textarea
                  value={observacao}
                  maxLength={255}
                  aria-label="Motivo da movimentação"
                  aria-invalid={!!campos.observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
                {campos.observacao && (
                  <span className="text-destructive">{campos.observacao}</span>
                )}
              </label>
              {erro && (
                <p role="alert" className="text-destructive">
                  {erro}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={
                    !saldo ||
                    !gradeDisponivel ||
                    ocupado ||
                    (rota === "ajustes"
                      ? !catalogo.permissoes.editar
                      : !catalogo.permissoes.criar)
                  }
                >
                  Confirmar movimentação
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

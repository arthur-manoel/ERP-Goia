"use client"
import { useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect } from "@/components/ui/native-select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import {
  dataCivil,
  lancamentoManualSchema,
} from "@/modules/lancamentos-financeiros/schema"
import { lerRespostaOperacao } from "@/features/erp/resposta-operacao"
import { moedaLivro, rotaLancamentos, type Opcoes } from "../lancamentos-api"

type Tentativa = { chave: string; body: string }
function lerTentativa(key: string): Tentativa | null {
  try {
    const p = JSON.parse(sessionStorage.getItem(key) ?? "null")
    return p && typeof p.chave === "string" && typeof p.body === "string"
      ? p
      : null
  } catch {
    return null
  }
}
function rascunho(t: Tentativa | null) {
  const inicial = {
    idConta: "",
    idCategoria: "",
    tipo: "ENTRADA",
    valor: "",
    data: dataCivil(new Date()),
    descricao: "",
    observacao: "",
  }
  try {
    if (!t) return inicial
    const valor = lancamentoManualSchema.safeParse(JSON.parse(t.body))
    if (!valor.success) return inicial
    return {
      ...valor.data,
      idConta: String(valor.data.idConta),
      idCategoria: String(valor.data.idCategoria),
      observacao: valor.data.observacao ?? "",
    }
  } catch {
    return inicial
  }
}

export function BuscaOpcoesFinanceiras({
  buscar,
}: {
  buscar: (q: string) => void
}) {
  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Buscar contas ou categorias
      </summary>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const q = new URLSearchParams()
          for (const [k, v] of new FormData(e.currentTarget)) {
            const t = String(v).trim()
            if (t) q.set(k, t)
          }
          buscar(q.toString())
        }}
      >
        <label className="grid gap-1 text-sm">
          Buscar conta
          <Input name="conta" maxLength={100} />
        </label>
        <label className="grid gap-1 text-sm">
          Buscar categoria
          <Input name="categoria" maxLength={100} />
        </label>
        <Button type="submit" variant="outline">
          Buscar opções
        </Button>
      </form>
    </details>
  )
}

export function FormularioLancamento({
  opcoes,
  buscarOpcoes,
  erroOpcoes,
  recarregarOpcoes,
  atualizar,
}: {
  opcoes: Opcoes | undefined
  buscarOpcoes: (q: string) => void
  erroOpcoes?: string
  recarregarOpcoes: () => void
  atualizar: () => void
}) {
  const { usuario, empresa, requisitar, chaveEmpresa, conferirEmpresa } =
    useAutenticacao()
  const key = `erp-lancamento:${usuario?.id}:${empresa?.id}`
  const [pendente, setPendente] = useState(() => lerTentativa(key))
  const [form, setForm] = useState(() => rascunho(pendente))
  const [aberto, setAberto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState("")
  const [campos, setCampos] = useState<Record<string, string>>({})
  const trava = useRef(false)
  const contas = opcoes?.contas.filter((c) => c.status === "ATIVA") ?? []
  const categorias =
    opcoes?.categorias.filter(
      (c) =>
        c.status === "ATIVA" &&
        (c.tipo === "AMBOS" ||
          c.tipo === (form.tipo === "ENTRADA" ? "RECEITA" : "DESPESA")),
    ) ?? []

  function limpar(t: Tentativa) {
    if (lerTentativa(key)?.chave === t.chave) sessionStorage.removeItem(key)
    setPendente((p) => (p?.chave === t.chave ? null : p))
  }
  async function enviar(t: Tentativa, recuperando = false) {
    if (trava.current) return
    try {
      conferirEmpresa(chaveEmpresa)
      const anterior = lerTentativa(key)
      if (anterior && anterior.chave !== t.chave) {
        setPendente(anterior)
        setErro("Recupere primeiro o lançamento que já está guardado.")
        return
      }
      sessionStorage.setItem(key, JSON.stringify(t))
    } catch {
      setErro("Não foi possível guardar a tentativa nesta sessão.")
      return
    }
    trava.current = true
    setOcupado(true)
    setPendente(t)
    setErro("")
    try {
      const r = await requisitar(rotaLancamentos, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": t.chave,
        },
        body: t.body,
      })
      const recusada =
        recuperando && !r.ok
          ? (
              await r
                .clone()
                .json()
                .catch(() => null)
            )?.code === "LANCAMENTO_RECUSADO" && [400, 404].includes(r.status)
          : false
      const resposta = await lerRespostaOperacao(r, () => {
        conferirEmpresa(chaveEmpresa)
        if (!recuperando || recusada) limpar(t)
      })
      conferirEmpresa(chaveEmpresa)
      if (!r.ok) {
        setErro(
          (resposta.error ?? "Confirmação inconclusiva.") +
            (recuperando && !recusada
              ? " A tentativa continua guardada para recuperação."
              : ""),
        )
        return
      }
      if (
        !Number.isInteger(resposta.data?.id) ||
        typeof resposta.data.valor !== "string"
      )
        throw new Error("Confirmação inválida")
      limpar(t)
      setAberto(false)
      setForm(rascunho(null))
      setCampos({})
      atualizar()
      toast.success(
        `Lançamento #${resposta.data.id} confirmado. ${moedaLivro(resposta.data.valor)}.`,
      )
    } catch {
      try {
        conferirEmpresa(chaveEmpresa)
        setErro(
          "A resposta foi interrompida. Recupere a mesma tentativa antes de criar outro lançamento.",
        )
      } catch {
        /* Chave guardada no contexto original. */
      }
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }

  function confirmar(e: FormEvent) {
    e.preventDefault()
    if (pendente || trava.current || !opcoes?.podeCriar) return
    const v = lancamentoManualSchema.safeParse({
      ...form,
      idConta: Number(form.idConta),
      idCategoria: Number(form.idCategoria),
      valor: form.valor.trim().replace(",", "."),
    })
    if (!v.success) {
      setCampos(
        Object.fromEntries(v.error.issues.map((i) => [i.path[0], i.message])),
      )
      return
    }
    setCampos({})
    void enviar({ chave: crypto.randomUUID(), body: JSON.stringify(v.data) })
  }
  const editar = (campo: keyof typeof form, valor: string) =>
    setForm((f) => ({
      ...f,
      [campo]: valor,
      ...(campo === "tipo" ? { idCategoria: "" } : {}),
    }))

  return (
    <>
      {(opcoes?.podeCriar || pendente) && (
        <Button onClick={() => setAberto(true)}>
          {pendente ? "Recuperar lançamento pendente" : "Novo lançamento"}
        </Button>
      )}
      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          if (!trava.current) setAberto(v)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {pendente ? "Recuperar lançamento" : "Novo lançamento"}
            </DialogTitle>
            <DialogDescription>
              Registre uma entrada ou saída manual de caixa.
            </DialogDescription>
          </DialogHeader>
          {erro && (
            <p role="alert" className="text-destructive">
              {erro}
            </p>
          )}
          {!pendente && <BuscaOpcoesFinanceiras buscar={buscarOpcoes} />}
          {!pendente &&
            !opcoes &&
            (erroOpcoes ? (
              <div role="alert" className="space-y-2">
                <p>{erroOpcoes}</p>
                <Button variant="outline" onClick={recarregarOpcoes}>
                  Recarregar opções
                </Button>
              </div>
            ) : (
              <p role="status" className="text-sm">
                Carregando contas e categorias…
              </p>
            ))}

          {pendente ? (
            <Button
              disabled={ocupado}
              onClick={() => void enviar(pendente, true)}
            >
              Recuperar mesma confirmação
            </Button>
          ) : (
            <form noValidate onSubmit={confirmar} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  Tipo do lançamento
                  <NativeSelect
                    aria-label="Tipo do lançamento"
                    value={form.tipo}
                    onChange={(e) => editar("tipo", e.target.value)}
                  >
                    <option value="ENTRADA">Entrada</option>
                    <option value="SAIDA">Saída</option>
                  </NativeSelect>
                </label>
                <label className="grid gap-1 text-sm">
                  Conta bancária
                  <NativeSelect
                    aria-label="Conta bancária"
                    disabled={!opcoes}
                    value={form.idConta}
                    onChange={(e) => editar("idConta", e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {form.idConta &&
                      !contas.some((c) => String(c.id) === form.idConta) && (
                        <option value={form.idConta}>
                          Conta #{form.idConta}
                        </option>
                      )}
                    {contas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </NativeSelect>
                  {campos.idConta && (
                    <span className="text-destructive">
                      Selecione uma conta ativa.
                    </span>
                  )}
                </label>
                <label className="grid gap-1 text-sm">
                  Categoria financeira
                  <NativeSelect
                    aria-label="Categoria financeira"
                    disabled={!opcoes}
                    value={form.idCategoria}
                    onChange={(e) => editar("idCategoria", e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {form.idCategoria &&
                      !categorias.some(
                        (c) => String(c.id) === form.idCategoria,
                      ) && (
                        <option value={form.idCategoria}>
                          Categoria #{form.idCategoria}
                        </option>
                      )}
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </NativeSelect>
                  {campos.idCategoria && (
                    <span className="text-destructive">
                      Selecione uma categoria ativa e compatível.
                    </span>
                  )}
                </label>
                <label className="grid gap-1 text-sm">
                  Data do lançamento
                  <Input
                    aria-label="Data do lançamento"
                    type="date"
                    value={form.data}
                    onChange={(e) => editar("data", e.target.value)}
                    max={dataCivil(new Date())}
                  />
                  {campos.data && (
                    <span className="text-destructive">{campos.data}</span>
                  )}
                </label>
                <label className="grid gap-1 text-sm">
                  Valor
                  <Input
                    aria-label="Valor"
                    value={form.valor}
                    inputMode="decimal"
                    onChange={(e) => editar("valor", e.target.value)}
                    placeholder="0,00"
                  />
                  {campos.valor && (
                    <span className="text-destructive">{campos.valor}</span>
                  )}
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                Descrição
                <Input
                  aria-label="Descrição"
                  maxLength={255}
                  value={form.descricao}
                  onChange={(e) => editar("descricao", e.target.value)}
                />
                {campos.descricao && (
                  <span className="text-destructive">{campos.descricao}</span>
                )}
              </label>
              <label className="grid gap-1 text-sm">
                Observação
                <Textarea
                  aria-label="Observação"
                  maxLength={255}
                  value={form.observacao}
                  onChange={(e) => editar("observacao", e.target.value)}
                />
              </label>
              <DialogFooter>
                <Button type="submit" disabled={ocupado || !opcoes?.podeCriar}>
                  Confirmar lançamento
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

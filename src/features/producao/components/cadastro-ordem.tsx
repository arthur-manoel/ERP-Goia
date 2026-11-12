"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"

type Consulta = (url: string, init?: RequestInit) => Promise<Response>
type Enviar = (url: string, body: unknown, metodo?: string) => Promise<void>

export type DadosOrdem = {
  id: number
  numero: string
  status: string
  prioridade: string
  quantidade_planejada: string
  data_previsao: string | null
  observacao: string | null
  id_setor: number | null
  id_local_estoque: number | null
  ordem_producao_fluxo_setor: {
    id: number
    id_setor: number
    ordem: number
    status: string
  }[]
}

export type ResumoOrdem = Pick<
  DadosOrdem,
  "id" | "numero" | "status" | "quantidade_planejada" | "data_previsao"
> & {
  setorAtual: string | null
  etapaAtual: { id: number; ordem: number; setores: { nome: string } } | null
  itens: {
    id: number
    quantidade_produzida: string
    produtos: { nome: string }
    cores: { nome: string } | null
    tamanhos: { nome: string } | null
  }[]
}

type Opcao = { id: number; nome: string }
type Produto = Opcao & {
  fluxo: string
  idSetorFinal: number
  estoque: { id_local_estoque: number; id_setor: number }[]
  produto_variacoes: {
    id: number
    cores: { nome: string } | null
    tamanhos: { nome: string } | null
  }[]
}
type Opcoes = { produtos: Produto[]; locais: Opcao[] }

const rota = "/api/ordens-producao"

export function CadastroOrdem({
  requisitar,
  ordem,
  fluxo,
  bloqueado,
  enviar,
}: {
  requisitar: Consulta
  ordem: DadosOrdem | null
  fluxo?: string
  bloqueado: boolean
  enviar: Enviar
}) {
  const [abrir, setAbrir] = useState(false)
  const terminal =
    ordem?.status === "CONCLUIDA" || ordem?.status === "CANCELADA"
  return (
    <div className="space-y-4">
      <Button
        variant="outline"
        disabled={bloqueado}
        onClick={() => setAbrir((v) => !v)}
      >
        {abrir ? "Fechar abertura" : "Abrir ordem de produção"}
      </Button>
      {abrir && (
        <AbrirOrdem
          requisitar={requisitar}
          enviar={enviar}
          bloqueado={bloqueado}
        />
      )}
      {ordem && (
        <div className="space-y-2 rounded-lg border p-4">
          <h3 className="font-semibold">Ordem {ordem.numero}</h3>
          {fluxo && <p>Fluxo cadastrado: {fluxo}</p>}
          {terminal ? (
            ordem.observacao && <p>{ordem.observacao}</p>
          ) : (
            <EditarOrdem
              key={JSON.stringify([
                ordem.id,
                ordem.status,
                ordem.observacao,
                ordem.data_previsao,
                ordem.quantidade_planejada,
                ordem.prioridade,
              ])}
              ordem={ordem}
              bloqueado={bloqueado}
              enviar={enviar}
            />
          )}
        </div>
      )}
    </div>
  )
}

function AbrirOrdem({
  requisitar,
  enviar,
  bloqueado,
}: {
  requisitar: Consulta
  enviar: Enviar
  bloqueado: boolean
}) {
  const [busca, setBusca] = useState("")
  const [revisao, setRevisao] = useState(0)
  const [resposta, setResposta] = useState<{
    busca: string
    revisao: number
    dados?: Opcoes
    erro?: string
  }>()
  const [produto, setProduto] = useState<Produto>()
  const [variacao, setVariacao] = useState("")
  const [local, setLocal] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await requisitar(
          `${rota}/opcoes?busca=${encodeURIComponent(busca)}`,
          {
            signal: controller.signal,
          },
        )
        const body = await res.json()
        if (!res.ok)
          throw new Error(body.error ?? "Não foi possível carregar as opções.")
        if (!controller.signal.aborted)
          setResposta({ busca, revisao, dados: body.data })
      } catch (error) {
        if (!controller.signal.aborted)
          setResposta({
            busca,
            revisao,
            erro:
              error instanceof Error
                ? error.message
                : "Não foi possível carregar as opções.",
          })
      }
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [busca, requisitar, revisao])

  const atual =
    resposta?.busca === busca && resposta.revisao === revisao
      ? resposta
      : undefined
  const resultados = atual?.dados?.produtos ?? []
  const produtos =
    produto && !resultados.some((p) => p.id === produto.id)
      ? [produto, ...resultados]
      : resultados
  const locais = (atual?.dados?.locais ?? []).filter((l) =>
    produto?.estoque.every(
      (e) =>
        (e.id_local_estoque === l.id) === (e.id_setor === produto.idSetorFinal),
    ),
  )
  const variacoes = produto?.produto_variacoes ?? []

  function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (bloqueado || !produto || !local || (variacoes.length > 0 && !variacao))
      return
    const fd = new FormData(event.currentTarget)
    const previsao = String(fd.get("previsao") ?? "")
    void enviar(rota, {
      idProduto: produto.id,
      idLocal: Number(local),
      ...(variacao ? { idVariacao: Number(variacao) } : {}),
      quantidade: String(fd.get("quantidade")).replace(",", "."),
      prioridade: fd.get("prioridade"),
      observacao: String(fd.get("observacao") ?? "").trim() || null,
      ...(previsao ? { dataPrevisao: `${previsao}T23:59:59Z` } : {}),
    })
  }

  return (
    <form
      onSubmit={salvar}
      aria-label="Abertura de ordem de produção"
      className="rounded-lg border p-4"
    >
      <fieldset disabled={bloqueado} className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="op-busca-produto">
            Buscar produto habilitado para produção
          </FieldLabel>
          <Input
            id="op-busca-produto"
            maxLength={100}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="op-produto">Produto</FieldLabel>
          <NativeSelect
            id="op-produto"
            required
            value={produto?.id ?? ""}
            disabled={!atual?.dados}
            onChange={(e) => {
              setProduto(produtos.find((p) => p.id === Number(e.target.value)))
              setVariacao("")
              setLocal("")
            }}
          >
            <NativeSelectOption value="">
              Selecione o produto
            </NativeSelectOption>
            {produtos.map((p) => (
              <NativeSelectOption value={p.id} key={p.id}>
                {p.nome}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {!atual && <p role="status">Carregando opções…</p>}
        {atual?.erro && (
          <Alert variant="destructive">
            <AlertDescription>
              {atual.erro}{" "}
              <Button
                type="button"
                variant="outline"
                onClick={() => setRevisao((r) => r + 1)}
              >
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {atual?.dados && !produtos.length && (
          <p>Nenhum produto com fluxo ativo encontrado.</p>
        )}
        {produto && <p>Fluxo cadastrado: {produto.fluxo}</p>}
        {!!variacoes.length && (
          <Field>
            <FieldLabel htmlFor="op-variacao">Variação</FieldLabel>
            <NativeSelect
              id="op-variacao"
              required
              value={variacao}
              onChange={(e) => setVariacao(e.target.value)}
            >
              <NativeSelectOption value="">
                Selecione a variação
              </NativeSelectOption>
              {variacoes.map((v) => (
                <NativeSelectOption value={v.id} key={v.id}>
                  {[v.cores?.nome, v.tamanhos?.nome]
                    .filter(Boolean)
                    .join(" / ") || `Variação ${v.id}`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="op-local">Local de entrada</FieldLabel>
          <NativeSelect
            id="op-local"
            required
            disabled={!produto || !atual?.dados}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
          >
            <NativeSelectOption value="">
              {produto && atual?.dados && !locais.length
                ? "Nenhum local compatível"
                : "Selecione o local"}
            </NativeSelectOption>
            {locais.map((l) => (
              <NativeSelectOption value={l.id} key={l.id}>
                {l.nome}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <CamposOrdem prefixo="op-abrir" />
        <Button
          type="submit"
          disabled={!produto || !locais.some((l) => String(l.id) === local)}
        >
          Criar ordem
        </Button>
      </fieldset>
    </form>
  )
}

function EditarOrdem({
  ordem,
  bloqueado,
  enviar,
}: {
  ordem: DadosOrdem
  bloqueado: boolean
  enviar: Enviar
}) {
  function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (bloqueado) return
    const fd = new FormData(event.currentTarget)
    const observacao = String(fd.get("observacao") ?? "").trim() || null
    const previsao = String(fd.get("previsao") ?? "")
    const quantidade = fd.get("quantidade")?.toString().replace(",", ".")
    const prioridade = fd.get("prioridade")
    void enviar(
      `${rota}/${ordem.id}`,
      {
        statusEsperado: ordem.status,
        observacao,
        ...(previsao !== (ordem.data_previsao?.slice(0, 10) ?? "")
          ? { dataPrevisao: previsao ? `${previsao}T23:59:59Z` : null }
          : {}),
        ...(quantidade && quantidade !== ordem.quantidade_planejada
          ? { quantidade }
          : {}),
        ...(prioridade && prioridade !== ordem.prioridade
          ? { prioridade }
          : {}),
      },
      "PATCH",
    )
  }
  return (
    <form onSubmit={salvar} aria-label="Edição da ordem de produção">
      <fieldset disabled={bloqueado} className="grid gap-3 sm:grid-cols-2">
        <CamposOrdem prefixo="op-editar" ordem={ordem} />
        <Button type="submit">Salvar alterações da ordem</Button>
      </fieldset>
    </form>
  )
}

function CamposOrdem({
  prefixo,
  ordem,
}: {
  prefixo: string
  ordem?: DadosOrdem
}) {
  const planejamento = !ordem || ordem.status === "PLANEJADA"
  return (
    <>
      {planejamento && (
        <>
          <Field>
            <FieldLabel htmlFor={`${prefixo}-quantidade`}>
              Quantidade planejada
            </FieldLabel>
            <Input
              id={`${prefixo}-quantidade`}
              name="quantidade"
              inputMode="decimal"
              required
              pattern="(?:0|[1-9][0-9]{0,11})(?:[.,][0-9]{1,3})?"
              defaultValue={ordem?.quantidade_planejada}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${prefixo}-prioridade`}>
              Prioridade
            </FieldLabel>
            <NativeSelect
              id={`${prefixo}-prioridade`}
              name="prioridade"
              defaultValue={ordem?.prioridade ?? "NORMAL"}
            >
              <NativeSelectOption value="BAIXA">Baixa</NativeSelectOption>
              <NativeSelectOption value="NORMAL">Normal</NativeSelectOption>
              <NativeSelectOption value="ALTA">Alta</NativeSelectOption>
              <NativeSelectOption value="URGENTE">Urgente</NativeSelectOption>
            </NativeSelect>
          </Field>
        </>
      )}
      <Field>
        <FieldLabel htmlFor={`${prefixo}-previsao`}>Previsão</FieldLabel>
        <Input
          id={`${prefixo}-previsao`}
          name="previsao"
          type="date"
          defaultValue={ordem?.data_previsao?.slice(0, 10)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${prefixo}-observacao`}>Observação</FieldLabel>
        <Textarea
          id={`${prefixo}-observacao`}
          name="observacao"
          maxLength={255}
          defaultValue={ordem?.observacao ?? ""}
        />
      </Field>
    </>
  )
}

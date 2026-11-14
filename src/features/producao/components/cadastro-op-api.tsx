"use client"

import { useId, useRef, useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { montarCadastroOp, type OrdemParaEdicao } from "../cadastro-op"

export function CadastroOpApi({
  id,
  produtos,
  bloqueado,
  aoSalvar,
}: {
  id?: string
  produtos: { id: number; nome: string }[]
  bloqueado: boolean
  aoSalvar: (id: string) => void
}) {
  const prefixo = useId()
  const { requisitar } = useAutenticacao()
  const [aberto, setAberto] = useState(false)
  const [ordem, setOrdem] = useState<OrdemParaEdicao | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState("")
  const [produtoSelecionado, setProdutoSelecionado] = useState<{
    id: number
    nome: string
  } | null>(null)
  const trava = useRef(false)
  async function abrir() {
    if (trava.current) return
    trava.current = true
    setOcupado(true)
    setErro("")
    try {
      if (id) {
        const response = await requisitar(`/api/ordens-producao/${id}`, {
          cache: "no-store",
        })
        const body = await response.json()
        if (!response.ok)
          throw new Error(body.error ?? "Não foi possível consultar a OP.")
        setOrdem(body.ordem)
      }
      setAberto(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na consulta.")
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }
  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (trava.current || bloqueado || terminal) return
    const body = montarCadastroOp(new FormData(event.currentTarget), ordem)
    if (ordem && Object.keys(body).length === 1) {
      setAberto(false)
      return
    }
    trava.current = true
    setOcupado(true)
    setErro("")
    try {
      const response = await requisitar(
        `/api/ordens-producao${id ? `/${id}` : ""}`,
        {
          method: id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      )
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error ?? "Não foi possível salvar a OP.")
      setAberto(false)
      aoSalvar(String(result.ordem.id))
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao salvar a OP.")
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }
  const terminal =
    ordem?.status === "CONCLUIDA" || ordem?.status === "CANCELADA"
  const produtosDisponiveis =
    produtoSelecionado && !produtos.some((p) => p.id === produtoSelecionado.id)
      ? [produtoSelecionado, ...produtos]
      : produtos
  return (
    <div className="space-y-3">
      <Button
        type="button"
        disabled={bloqueado || ocupado || aberto}
        onClick={() => void abrir()}
      >
        {ocupado ? "Carregando…" : id ? "Editar OP" : "Abrir ordem de produção"}
      </Button>
      {erro && <p role="alert">{erro}</p>}
      {aberto && (
        <form onSubmit={salvar} className="space-y-3 rounded-md border p-4">
          <h3 className="font-semibold">
            {id ? "Editar ordem de produção" : "Abrir ordem de produção"}
          </h3>
          {terminal && (
            <p>Ordens concluídas ou canceladas não podem ser editadas.</p>
          )}
          <fieldset
            disabled={ocupado || bloqueado || terminal}
            className="grid gap-3 sm:grid-cols-2"
          >
            {!id && (
              <Field>
                <FieldLabel htmlFor={`${prefixo}-produto`}>Produto</FieldLabel>
                <NativeSelect
                  id={`${prefixo}-produto`}
                  name="produto"
                  required
                  value={produtoSelecionado?.id ?? ""}
                  onChange={(event) =>
                    setProdutoSelecionado(
                      produtosDisponiveis.find(
                        (p) => p.id === Number(event.target.value),
                      ) ?? null,
                    )
                  }
                >
                  <NativeSelectOption value="" disabled>
                    Selecione o produto
                  </NativeSelectOption>
                  {produtosDisponiveis.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.nome}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
            {(!ordem ||
              (ordem.status === "PLANEJADA" &&
                ordem.ordem_producao_item.length === 1)) && (
              <>
                <Field>
                  <FieldLabel htmlFor={`${prefixo}-quantidade`}>
                    Quantidade planejada
                  </FieldLabel>
                  <Input
                    id={`${prefixo}-quantidade`}
                    name="quantidade"
                    type="number"
                    min="0.001"
                    max="999999999999.999"
                    step="0.001"
                    required
                    defaultValue={
                      ordem?.ordem_producao_item[0]?.quantidade ?? ""
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`${prefixo}-tamanho`}>
                    Tamanho
                  </FieldLabel>
                  <Input
                    id={`${prefixo}-tamanho`}
                    name="tamanho"
                    required
                    maxLength={30}
                    defaultValue={
                      ordem?.ordem_producao_item[0]?.tamanho ?? "UNICO"
                    }
                  />
                </Field>
              </>
            )}
            {(!ordem || ordem.status === "PLANEJADA") && (
              <Field>
                <FieldLabel htmlFor={`${prefixo}-prioridade`}>
                  Prioridade
                </FieldLabel>
                <NativeSelect
                  id={`${prefixo}-prioridade`}
                  name="prioridade"
                  defaultValue={ordem?.prioridade ?? "NORMAL"}
                >
                  {["BAIXA", "NORMAL", "ALTA", "URGENTE"].map((p) => (
                    <NativeSelectOption key={p} value={p}>
                      {p}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor={`${prefixo}-previsao`}>Previsão</FieldLabel>
              <Input
                id={`${prefixo}-previsao`}
                name="previsao"
                type="date"
                defaultValue={ordem?.data_previsao?.slice(0, 10) ?? ""}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${prefixo}-observacao`}>
                Observação
              </FieldLabel>
              <Textarea
                id={`${prefixo}-observacao`}
                name="observacao"
                maxLength={255}
                defaultValue={ordem?.observacao ?? ""}
              />
            </Field>
            <Button type="submit">{ocupado ? "Salvando…" : "Salvar OP"}</Button>
          </fieldset>
          <Button
            type="button"
            variant="outline"
            disabled={ocupado}
            onClick={() => setAberto(false)}
          >
            Cancelar
          </Button>
        </form>
      )}
    </div>
  )
}

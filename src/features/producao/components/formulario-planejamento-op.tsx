"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { quantidade as quantidadeOperacional } from "@/modules/reservas/reservas.schema"

type OpcaoProduto = {
  id: number
  nome: string
  unidade: string
  produto_variacoes: {
    id: number
    cores: { nome: string } | null
    tamanhos: { nome: string } | null
  }[]
}

export function FormularioPlanejamentoOP({
  inicial,
  produtos,
  locais,
  onClose,
  onRascunho,
  onSalvo,
}: {
  inicial?: { id: number; numero: string; id_local_estoque: number | null }
  produtos: OpcaoProduto[]
  locais: { id: number; nome: string }[]
  onClose: () => void
  onRascunho: (id: number) => void
  onSalvo: (id: number) => void
}) {
  const { requisitar, empresa } = useAutenticacao()
  const [produto, setProduto] = useState<OpcaoProduto>()
  const [variacao, setVariacao] = useState("")
  const [rascunho, setRascunho] = useState<number | undefined>(inicial?.id)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState("")
  const trava = useRef(false)
  const [buscaProduto, buscarProduto] = useState("")
  const [consulta, setConsulta] = useState<{
    busca: string
    produtos: OpcaoProduto[]
    erro?: string
  }>()
  useEffect(() => {
    const busca = buscaProduto.trim()
    if (!busca) return
    const controle = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const resposta = await requisitar(
          `/api/estoque/reservas/opcoes?busca=${encodeURIComponent(busca)}`,
          { signal: controle.signal },
        )
        if (!resposta.ok) throw new Error(await mensagemErro(resposta))
        const corpo = (await resposta.json()) as {
          data: { produtos: OpcaoProduto[] }
        }
        if (!controle.signal.aborted)
          setConsulta({ busca, produtos: corpo.data.produtos })
      } catch (error) {
        if (!controle.signal.aborted)
          setConsulta({
            busca,
            produtos: [],
            erro: error instanceof Error ? error.message : "Falha na busca.",
          })
      }
    }, 300)
    return () => {
      window.clearTimeout(timer)
      controle.abort()
    }
  }, [buscaProduto, requisitar])
  const busca = buscaProduto.trim()
  const resultados = busca
    ? consulta?.busca === busca
      ? consulta.produtos
      : []
    : produtos
  const opcoesProduto =
    produto && !resultados.some(({ id }) => id === produto.id)
      ? [...resultados, produto]
      : resultados

  async function enviar(url: string, dados: object, method = "POST") {
    const resposta = await requisitar(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Empresa-Id": String(empresa?.id),
      },
      body: JSON.stringify(dados),
    })
    if (!resposta.ok) throw new Error(await mensagemErro(resposta))
    return resposta
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (trava.current) return
    const campos = new FormData(evento.currentTarget)
    const quantidade = quantidadeOperacional.safeParse(
      String(campos.get("quantidade")).trim().replace(",", "."),
    )
    if (
      !produto ||
      !quantidade.success ||
      (produto.produto_variacoes.length > 0 && !variacao)
    ) {
      setErro(
        "Selecione o produto, a variação quando houver grade e informe uma quantidade positiva com até três casas decimais.",
      )
      return
    }
    trava.current = true
    setOcupado(true)
    setErro("")
    try {
      let id = rascunho
      if (!id) {
        const resposta = await enviar("/api/ordem_producao", {
          numero: String(campos.get("numero")).trim(),
          id_local_estoque: Number(campos.get("local")),
          quantidade_planejada: quantidade.data,
          data_previsao: campos.get("previsao") || null,
        })
        const corpo = (await resposta.json()) as { data: { id: number } }
        id = corpo.data.id
        setRascunho(id)
        onRascunho(id)
      } else {
        const resposta = await requisitar(
          `/api/ordem_producao/${id}/itens?limit=1`,
          { headers: { "X-Empresa-Id": String(empresa?.id) } },
        )
        if (!resposta.ok) throw new Error(await mensagemErro(resposta))
        const corpo = (await resposta.json()) as { data: { rows: unknown[] } }
        if (corpo.data.rows.length > 0) {
          onSalvo(id)
          return
        }
        await enviar(
          `/api/ordem_producao/${id}`,
          {
            quantidade_planejada: quantidade.data,
            ...(inicial
              ? { id_local_estoque: Number(campos.get("local")) }
              : {}),
          },
          "PATCH",
        )
      }
      await enviar(`/api/ordem_producao/${id}/itens`, {
        id_produto: produto.id,
        ...(variacao ? { id_variacao: Number(variacao) } : {}),
        quantidade: quantidade.data,
      })
      onSalvo(id)
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a ordem.",
      )
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !ocupado) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova ordem de produção</DialogTitle>
          <DialogDescription>
            Selecione um produto com ficha técnica ativa e fluxo de produção
            associado.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={salvar} className="space-y-4">
          {erro && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
          {rascunho && (
            <p role="status">
              A ordem #{rascunho} já está salva como planejada. Você pode
              corrigir o item e tentar novamente.
            </p>
          )}
          <fieldset disabled={ocupado} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="nova-op-numero">Número</FieldLabel>
              <Input
                id="nova-op-numero"
                name="numero"
                required
                maxLength={50}
                defaultValue={inicial?.numero}
                readOnly={!!rascunho}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="nova-op-local">
                Estoque de destino na fábrica
              </FieldLabel>
              <NativeSelect
                id="nova-op-local"
                name="local"
                required
                disabled={ocupado || (!!rascunho && !inicial)}
                defaultValue={inicial?.id_local_estoque ?? ""}
              >
                <option value="" disabled>
                  Selecione o local
                </option>
                {locais.map((local) => (
                  <option key={local.id} value={local.id}>
                    {local.nome}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="nova-op-busca">Buscar produto</FieldLabel>
              <Input
                id="nova-op-busca"
                value={buscaProduto}
                maxLength={100}
                onChange={(evento) => buscarProduto(evento.target.value)}
              />
            </Field>
            {busca && consulta?.busca === busca && consulta.erro && (
              <p role="alert">{consulta.erro}</p>
            )}
            <Field>
              <FieldLabel htmlFor="nova-op-produto">Produto</FieldLabel>
              <SearchSelect
                id="nova-op-produto"
                value={produto ? String(produto.id) : ""}
                onValueChange={(id) => {
                  setProduto(
                    opcoesProduto.find((opcao) => String(opcao.id) === id),
                  )
                  setVariacao("")
                }}
                options={opcoesProduto.map((opcao) => ({
                  value: String(opcao.id),
                  label: `${opcao.nome} · ${opcao.unidade}`,
                }))}
              />
            </Field>
            {!!produto?.produto_variacoes.length && (
              <Field>
                <FieldLabel htmlFor="nova-op-variacao">Variação</FieldLabel>
                <NativeSelect
                  id="nova-op-variacao"
                  value={variacao}
                  required
                  onChange={(evento) => setVariacao(evento.target.value)}
                >
                  <option value="" disabled>
                    Selecione a variação
                  </option>
                  {produto.produto_variacoes.map((opcao) => (
                    <option key={opcao.id} value={opcao.id}>
                      {[opcao.cores?.nome, opcao.tamanhos?.nome]
                        .filter(Boolean)
                        .join(" / ") || `Variação ${opcao.id}`}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="nova-op-quantidade">
                Quantidade planejada
              </FieldLabel>
              <Input
                id="nova-op-quantidade"
                name="quantidade"
                inputMode="decimal"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="nova-op-previsao">
                Previsão de conclusão
              </FieldLabel>
              <Input
                id="nova-op-previsao"
                name="previsao"
                type="date"
                readOnly={!!rascunho}
              />
            </Field>
          </fieldset>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={ocupado}
            >
              Fechar
            </Button>
            <Button type="submit" disabled={ocupado}>
              {ocupado ? "Salvando…" : "Salvar ordem"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

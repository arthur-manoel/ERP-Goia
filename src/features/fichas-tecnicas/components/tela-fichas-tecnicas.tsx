"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import type { Produto, RespostaPaginada } from "@/features/produtos/tipos"
import { quantidade } from "@/modules/reservas/reservas.schema"

import {
  consultarFicha,
  salvarFicha,
  ConflitoFichaError,
  type Ficha,
  type ItemFicha,
} from "../api"

type Catalogo = Pick<
  Produto,
  "id" | "nome" | "codigo" | "unidade" | "permite_producao" | "controla_estoque"
>

export function TelaFichasTecnicas() {
  const { empresa, estado } = useAutenticacao()
  if (estado === "carregando") return <Skeleton className="h-32 w-full" />
  if (!empresa) return <p>Selecione uma empresa ativa.</p>
  return <Conteudo key={empresa.id} idEmpresa={empresa.id} />
}

function Conteudo({ idEmpresa }: { idEmpresa: number }) {
  const { requisitar } = useAutenticacao()
  const [catalogo, setCatalogo] = useState<Catalogo[]>()
  const [erro, setErro] = useState("")
  const [produto, setProduto] = useState("")
  const [revisao, setRevisao] = useState(0)
  useEffect(() => {
    const controle = new AbortController()
    const { signal } = controle
    async function carregar() {
      const produtos: Catalogo[] = []
      let totalPaginas = 1
      for (let pagina = 1; pagina <= totalPaginas; pagina++) {
        const resposta = await requisitar(
          `/api/produtos?id_empresa=${idEmpresa}&status=ATIVO&page=${pagina}&limit=100`,
          { signal },
        )
        if (!resposta.ok) throw new Error(await mensagemErro(resposta))
        const { data } = (await resposta.json()) as {
          data: RespostaPaginada<Catalogo>
        }
        produtos.push(...data.rows.filter((item) => item.controla_estoque))
        totalPaginas = data.totalPages
      }
      if (!signal.aborted) setCatalogo(produtos)
    }
    void carregar().catch((error: unknown) => {
      if (!signal.aborted)
        setErro(
          error instanceof Error
            ? error.message
            : "Falha ao carregar produtos.",
        )
    })
    return () => controle.abort()
  }, [idEmpresa, requisitar, revisao])

  if (erro)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {erro}{" "}
          <Button
            variant="outline"
            onClick={() => {
              setErro("")
              setRevisao((valor) => valor + 1)
            }}
          >
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    )
  if (!catalogo) return <Skeleton className="h-32 w-full" />
  const fabricaveis = catalogo.filter((item) => item.permite_producao)
  if (!fabricaveis.length)
    return (
      <p>Cadastre um produto com produção e controle de estoque habilitados.</p>
    )

  return (
    <div className="max-w-3xl space-y-5">
      <Field>
        <FieldLabel htmlFor="ficha-produto">Produto fabricado</FieldLabel>
        <SearchSelect
          id="ficha-produto"
          value={produto}
          onValueChange={setProduto}
          options={fabricaveis.map((item) => ({
            value: String(item.id),
            label: `${item.codigo} · ${item.nome}`,
          }))}
        />
      </Field>
      {produto && (
        <FichaProduto
          key={produto}
          idProduto={Number(produto)}
          idEmpresa={idEmpresa}
          catalogo={catalogo}
        />
      )}
    </div>
  )
}

function FichaProduto({
  idProduto,
  idEmpresa,
  catalogo,
}: {
  idProduto: number
  idEmpresa: number
  catalogo: Catalogo[]
}) {
  const { requisitar } = useAutenticacao()
  const [ficha, setFicha] = useState<Ficha | null>()
  const [itens, setItens] = useState<ItemFicha[]>([])
  const [componente, setComponente] = useState("")
  const [consumo, setConsumo] = useState("")
  const [erro, setErro] = useState("")
  const [revisao, setRevisao] = useState(0)
  const [ocupado, setOcupado] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const trava = useRef(false)
  const [conflito, setConflito] = useState(false)
  const opcoes = catalogo.filter(
    (item) =>
      item.id !== idProduto &&
      !itens.some((linha) => linha.id_produto_componente === item.id),
  )

  useEffect(() => {
    const controle = new AbortController()
    const { signal } = controle
    void consultarFicha(requisitar, idEmpresa, idProduto, signal)
      .then((data) => {
        if (!signal.aborted) {
          setFicha(data)
          setItens(data?.itens ?? [])
        }
      })
      .catch((error: unknown) => {
        if (!signal.aborted)
          setErro(
            error instanceof Error
              ? error.message
              : "Falha ao consultar a ficha.",
          )
      })
    return () => controle.abort()
  }, [idEmpresa, idProduto, requisitar, revisao])

  function adicionar() {
    if (itens.length >= 500) {
      setErro("A ficha permite até 500 componentes.")
      return
    }
    const validado = quantidade.safeParse(consumo.trim().replace(",", "."))
    if (
      !opcoes.some((item) => String(item.id) === componente) ||
      !validado.success
    ) {
      setErro(
        "Selecione um componente e informe uma quantidade positiva com até três casas decimais.",
      )
      return
    }
    setErro("")
    setSucesso(false)
    setItens((atuais) => [
      ...atuais,
      { id_produto_componente: Number(componente), quantidade: validado.data },
    ])
    setComponente("")
    setConsumo("")
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (trava.current || !itens.length) return
    trava.current = true
    setOcupado(true)
    setErro("")
    setSucesso(false)
    try {
      const data = await salvarFicha(requisitar, idEmpresa, {
        id_produto: idProduto,
        id_ficha_esperada: ficha?.id ?? null,
        itens,
      })
      setConflito(false)
      setFicha(data)
      setItens(data.itens)
      setSucesso(true)
    } catch (error) {
      setConflito(error instanceof ConflitoFichaError)
      setErro(
        error instanceof Error ? error.message : "Falha ao salvar a ficha.",
      )
    } finally {
      trava.current = false
      setOcupado(false)
    }
  }

  if (ficha === undefined)
    return erro ? (
      <Alert variant="destructive">
        <AlertDescription>
          {erro}{" "}
          <Button
            variant="outline"
            onClick={() => {
              setErro("")
              setRevisao((valor) => valor + 1)
            }}
          >
            Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    ) : (
      <Skeleton className="h-32 w-full" />
    )

  return (
    <form onSubmit={salvar} className="space-y-4">
      {ficha && <p>Ficha ativa · versão {ficha.versao}</p>}
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      {conflito && (
        <div className="space-y-2">
          <p className="text-sm">
            Recarregar substitui a composição em edição pela versão ativa salva.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={ocupado}
            onClick={() => {
              setFicha(undefined)
              setErro("")
              setSucesso(false)
              setConflito(false)
              setRevisao((valor) => valor + 1)
            }}
          >
            Recarregar ficha ativa
          </Button>
        </div>
      )}
      {sucesso && <p role="status">Ficha técnica ativada.</p>}
      <fieldset disabled={ocupado} className="space-y-4">
        {itens.map((item) => {
          const material = catalogo.find(
            ({ id }) => id === item.id_produto_componente,
          )
          return (
            <div
              key={item.id_produto_componente}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <span>
                {material?.nome ?? `Componente #${item.id_produto_componente}`}{" "}
                · {item.quantidade} {material?.unidade}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSucesso(false)
                  setItens((atuais) =>
                    atuais.filter(
                      (linha) =>
                        linha.id_produto_componente !==
                        item.id_produto_componente,
                    ),
                  )
                }}
              >
                Remover
              </Button>
            </div>
          )
        })}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ficha-componente">Insumo</FieldLabel>
            <SearchSelect
              id="ficha-componente"
              value={componente}
              onValueChange={setComponente}
              options={opcoes.map((item) => ({
                value: String(item.id),
                label: `${item.nome} · ${item.unidade}`,
              }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="ficha-consumo">Quantidade por peça</FieldLabel>
            <Input
              id="ficha-consumo"
              inputMode="decimal"
              value={consumo}
              onChange={(evento) => setConsumo(evento.target.value)}
            />
          </Field>
        </div>
        <Button type="button" variant="outline" onClick={adicionar}>
          Adicionar insumo
        </Button>
      </fieldset>
      <Button type="submit" disabled={ocupado || conflito || !itens.length}>
        {ocupado ? "Salvando…" : "Salvar e ativar"}
      </Button>
    </form>
  )
}

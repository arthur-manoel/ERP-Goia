"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import type { Produto } from "../tipos"

type Fluxo = {
  id: number
  nome: string
  ativo: boolean
  setores: { ativo: boolean }[]
}

export function DialogoFluxoProduto({
  produto,
  aoFechar,
}: {
  produto: Produto
  aoFechar: () => void
}) {
  const { requisitar } = useAutenticacao()
  const [fluxos, setFluxos] = useState<Fluxo[]>([])
  const [selecionado, setSelecionado] = useState("")
  const [atual, setAtual] = useState<Fluxo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState("")
  const [erroLista, setErroLista] = useState("")

  useEffect(() => {
    let ativo = true
    async function carregar() {
      let associacaoCarregada = false
      try {
        const associacao = await requisitar(`/api/produtos/${produto.id}/fluxo`)
        if (!associacao.ok) throw new Error(await mensagemErro(associacao))
        const dados = (await associacao.json()) as {
          produto: { fluxoId: number | null }
          fluxo: Fluxo | null
        }
        associacaoCarregada = true
        if (ativo) {
          setAtual(dados.fluxo)
          setSelecionado(
            dados.produto.fluxoId ? String(dados.produto.fluxoId) : "",
          )
        }

        const todos: Fluxo[] = []
        let pagina = 1
        let totalPaginas = 1
        do {
          const resposta = await requisitar(
            `/api/fluxos-producao?pagina=${pagina}&limite=100`,
          )
          if (!resposta.ok) throw new Error(await mensagemErro(resposta))
          const corpo = (await resposta.json()) as {
            fluxos: Fluxo[]
            paginacao: { totalPaginas: number }
          }
          todos.push(...corpo.fluxos)
          totalPaginas = corpo.paginacao.totalPaginas
          pagina += 1
        } while (pagina <= totalPaginas)
        if (ativo) setFluxos(todos)
      } catch (causa) {
        if (!ativo) return
        const mensagem =
          causa instanceof Error
            ? causa.message
            : "Não foi possível consultar o fluxo."
        // A associação pode ser consultada com PRODUTOS.pode_ler mesmo quando
        // a listagem de fluxos exige outra permissão.
        if (associacaoCarregada) setErroLista(mensagem)
        else setErro(mensagem)
      } finally {
        if (ativo) setCarregando(false)
      }
    }
    void carregar()
    return () => {
      ativo = false
    }
  }, [produto.id, requisitar])

  async function salvar() {
    if (!selecionado || salvando) return
    setSalvando(true)
    setErro("")
    try {
      const resposta = await requisitar(`/api/produtos/${produto.id}/fluxo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fluxoId: Number(selecionado) }),
      })
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success("Fluxo associado ao produto.")
      aoFechar()
    } catch (causa) {
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível associar o fluxo.",
      )
    } finally {
      setSalvando(false)
    }
  }

  async function remover() {
    if (!atual || salvando) return
    setSalvando(true)
    setErro("")
    try {
      const resposta = await requisitar(`/api/produtos/${produto.id}/fluxo`, {
        method: "DELETE",
      })
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success("Fluxo removido do produto.")
      aoFechar()
    } catch (causa) {
      setErro(
        causa instanceof Error
          ? causa.message
          : "Não foi possível remover o fluxo.",
      )
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(aberto) => {
        if (!aberto && !salvando) aoFechar()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fluxo de produção — {produto.nome}</DialogTitle>
          <DialogDescription>
            Associação do produto à empresa selecionada.
          </DialogDescription>
        </DialogHeader>
        {carregando ? (
          <p role="status" className="text-sm">
            Carregando fluxo...
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm">
              Fluxo atual: <strong>{atual?.nome ?? "Nenhum"}</strong>
            </p>
            <label className="block space-y-1 text-sm font-medium">
              <span>Selecionar fluxo</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={selecionado}
                onChange={(evento) => setSelecionado(evento.target.value)}
                disabled={salvando || Boolean(erroLista)}
              >
                <option value="">Selecione um fluxo</option>
                {fluxos
                  .filter(
                    (fluxo) =>
                      fluxo.ativo &&
                      fluxo.setores.length > 0 &&
                      fluxo.setores.every((setor) => setor.ativo),
                  )
                  .map((fluxo) => (
                    <option key={fluxo.id} value={fluxo.id}>
                      {fluxo.nome}
                    </option>
                  ))}
              </select>
            </label>
            {erroLista && (
              <p className="text-sm text-muted-foreground">
                A lista de fluxos não está disponível: {erroLista}
              </p>
            )}
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={aoFechar} disabled={salvando}>
            Fechar
          </Button>
          <Button
            variant="destructive"
            onClick={() => void remover()}
            disabled={carregando || salvando || !atual}
          >
            Remover associação
          </Button>
          <Button
            onClick={() => void salvar()}
            disabled={
              carregando || salvando || !selecionado || Boolean(erroLista)
            }
          >
            Salvar fluxo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

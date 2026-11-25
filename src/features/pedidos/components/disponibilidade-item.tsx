"use client"

import { useEffect, useState } from "react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { formatarQuantidade } from "@/lib/formatacao"
import { Button } from "@/components/ui/button"

export function DisponibilidadeItem({
  produto,
  variacao,
  quantidade,
  exigeVariacao = false,
}: {
  produto: string
  variacao?: string
  quantidade: number
  exigeVariacao?: boolean
}) {
  const { requisitar, empresa } = useAutenticacao()
  const [revisao, atualizar] = useState(0)
  const chave = `${empresa?.id}:${produto}:${variacao ?? ""}:${quantidade}:${revisao}`
  const [resultado, definir] = useState<{
    chave: string
    dados?: { fisica: string; reservada: string; disponivel: string }
    erro?: string
  } | null>(null)
  const valido = /^[1-9]\d*$/.test(produto) && (!exigeVariacao || !!variacao)
  useEffect(() => {
    if (!valido) return
    const abortar = new AbortController()
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ idProduto: produto })
      if (variacao) query.set("idVariacao", variacao)
      void requisitar(`/api/pedidos/disponibilidade?${query}`, {
        signal: abortar.signal,
      })
        .then(async (resposta) => {
          const corpo = await resposta.json()
          if (!resposta.ok || !corpo.success)
            throw new Error(
              corpo.error || "Não foi possível consultar o estoque.",
            )
          if (!abortar.signal.aborted) definir({ chave, dados: corpo.data })
        })
        .catch((erro) => {
          if (!abortar.signal.aborted)
            definir({
              chave,
              erro:
                erro instanceof Error
                  ? erro.message
                  : "Falha ao consultar estoque.",
            })
        })
    }, 250)
    return () => {
      clearTimeout(timer)
      abortar.abort()
    }
  }, [chave, produto, variacao, valido, requisitar])
  const atual = resultado?.chave === chave ? resultado : null
  const dados = atual?.dados
  const faltante = dados
    ? Math.max(0, quantidade - Number(dados.disponivel))
    : 0
  const fmt = (v: string | number) => formatarQuantidade(Number(v), 3)
  return (
    <div role="status" className="space-y-1 text-sm">
      {!valido ? (
        <p>Selecione o produto e a variação para consultar o estoque.</p>
      ) : atual?.erro ? (
        <p className="text-destructive">{atual.erro}</p>
      ) : !dados ? (
        <p>Consultando estoque…</p>
      ) : (
        <>
          <p>
            Saldo físico: {fmt(dados.fisica)} · Reservado:{" "}
            {fmt(dados.reservada)} · Disponível: {fmt(dados.disponivel)}
          </p>
          {Number.isFinite(quantidade) && quantidade > 0 && (
            <p
              className={
                faltante > 0 ? "text-destructive" : "text-muted-foreground"
              }
            >
              {faltante > 0
                ? `Estoque insuficiente: faltam ${fmt(faltante)} unidade(s).`
                : "Disponível em estoque."}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Consulta informativa; salvar o pedido não reserva estoque.
          </p>
        </>
      )}
      {valido && atual && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => atualizar((v) => v + 1)}
        >
          Atualizar estoque
        </Button>
      )}
    </div>
  )
}

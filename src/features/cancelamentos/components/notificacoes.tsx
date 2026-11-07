"use client"
import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/layout/page-header"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { formatarDataHora } from "@/lib/formatacao"
type Lista = {
  itens: {
    id: number
    lidaEm: string | null
    criadaEm: string
    idCancelamento: number
    titulo: string
    mensagem: string
  }[]
  total: number
  pagina: number
  limite: number
}
export function Notificacoes() {
  const { estado, empresa, usuario } = useAutenticacao()
  return (
    <>
      <PageHeader
        titulo="Notificações internas"
        descricao="Acompanhe decisões e pendências de cancelamento da empresa ativa."
      />
      {estado === "autenticado" && empresa ? (
        <Conteudo key={`${usuario?.email}:${empresa.id}`} />
      ) : (
        <p>Entre na sua conta e selecione uma empresa.</p>
      )}
    </>
  )
}
function Conteudo() {
  const { requisitar } = useAutenticacao()
  const [lista, setLista] = useState<Lista>()
  const [erro, setErro] = useState("")
  const [ocupado, setOcupado] = useState(false)
  const [pagina, setPagina] = useState(1)
  const [revisao, setRevisao] = useState(0)
  const carregar = useCallback(async () => {
    const r = await requisitar(`/api/notificacoes?pagina=${pagina}&limite=25`, {
      cache: "no-store",
    })
    const v = await r.json()
    if (!r.ok) throw new Error(v.error ?? "Não foi possível consultar.")
    return v.data as Lista
  }, [pagina, requisitar])
  useEffect(() => {
    let ativa = true
    void carregar().then(
      (v) => {
        if (ativa) setLista(v)
      },
      (e) => {
        if (ativa) {
          setLista(undefined)
          setErro(e.message)
        }
      },
    )
    return () => {
      ativa = false
    }
  }, [carregar, revisao])
  async function executar(url: string) {
    if (ocupado) return
    setOcupado(true)
    setErro("")
    try {
      const r = await requisitar(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: "{}",
      })
      const v = await r.json()
      if (!r.ok) throw new Error(v.error)
      if (v.notificacoes?.entregaPendente)
        setErro(
          "Algumas notificações continuam pendentes; tente atualizar novamente.",
        )
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setLista(undefined)
      setRevisao((r) => r + 1)
      setOcupado(false)
    }
  }
  function mudarPagina(delta: number) {
    setLista(undefined)
    setErro("")
    setPagina((atual) => atual + delta)
  }
  return (
    <div className="space-y-4">
      <Button
        disabled={ocupado}
        variant="outline"
        onClick={() => void executar("/api/notificacoes/processar")}
      >
        Atualizar e repetir entregas pendentes
      </Button>
      {erro && (
        <p role="alert" className="text-destructive">
          {erro}
        </p>
      )}
      {lista?.pagina === pagina &&
        lista.itens.map((n) => (
          <article key={n.id} className="space-y-2 rounded-lg border p-4">
            <h2 className="font-semibold">
              {n.titulo}
              {n.lidaEm ? "" : " · Não lida"}
            </h2>
            <p>{n.mensagem}</p>
            <p className="text-sm text-muted-foreground">
              {formatarDataHora(new Date(n.criadaEm))}
            </p>
            <div className="flex gap-4">
              <Link
                className="underline"
                href={`/vendas/pedidos/cancelamentos?cancelamento=${n.idCancelamento}`}
              >
                Acompanhar solicitação
              </Link>
              {!n.lidaEm && (
                <Button
                  disabled={ocupado}
                  variant="outline"
                  onClick={() => void executar(`/api/notificacoes/${n.id}/ler`)}
                >
                  Marcar como lida
                </Button>
              )}
            </div>
          </article>
        ))}
      {lista?.pagina === pagina && lista.itens.length === 0 && (
        <p>Nenhuma notificação disponível.</p>
      )}
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={pagina === 1 || ocupado}
          onClick={() => mudarPagina(-1)}
        >
          Anterior
        </Button>
        <span>Página {pagina}</span>
        <Button
          variant="outline"
          disabled={
            lista?.pagina !== pagina || pagina * 25 >= lista.total || ocupado
          }
          onClick={() => mudarPagina(1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  )
}

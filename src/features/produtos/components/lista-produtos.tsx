"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { StatusProduto } from "../constantes"
import { FiltrosProdutos } from "./filtros-produtos"
import {
  TabelaProdutos,
  type OrdenacaoCodigo,
  type ProdutoTabela,
} from "./tabela-produtos"

function criarHref({
  busca,
  status,
  ordenacao,
}: {
  busca: string
  status?: StatusProduto
  ordenacao: OrdenacaoCodigo
}) {
  const parametros = new URLSearchParams()
  if (busca) parametros.set("busca", busca)
  if (status) parametros.set("status", status)
  if (ordenacao === "desc") parametros.set("ordem", "codigo-desc")

  const query = parametros.toString()
  return query ? `/produtos?${query}` : "/produtos"
}

export function ListaProdutos() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [busca, setBusca] = useState(() => searchParams.get("busca") ?? "")
  const [status, setStatus] = useState<StatusProduto | undefined>(() => {
    const valor = searchParams.get("status")
    return valor === "ATIVO" || valor === "INATIVO" ? valor : undefined
  })
  const [ordenacao, setOrdenacao] = useState<OrdenacaoCodigo>(() =>
    searchParams.get("ordem") === "codigo-desc" ? "desc" : "asc",
  )

  function atualizarUrl(
    proximaBusca: string,
    proximoStatus: StatusProduto | undefined,
    proximaOrdenacao: OrdenacaoCodigo,
  ) {
    router.replace(
      criarHref({
        busca: proximaBusca.trim(),
        status: proximoStatus,
        ordenacao: proximaOrdenacao,
      }),
    )
  }

  function alterarBusca(valor: string) {
    setBusca(valor)
    atualizarUrl(valor, status, ordenacao)
  }

  function alterarStatus(valor: StatusProduto | undefined) {
    setStatus(valor)
    atualizarUrl(busca, valor, ordenacao)
  }

  function alterarOrdenacao() {
    const proximaOrdenacao = ordenacao === "asc" ? "desc" : "asc"
    setOrdenacao(proximaOrdenacao)
    atualizarUrl(busca, status, proximaOrdenacao)
  }

  function limparFiltros() {
    setBusca("")
    setStatus(undefined)
    setOrdenacao("asc")
    router.replace("/produtos")
  }

  // Sem dados fictícios, a primeira entrega usa o estado vazio real da grade.
  const produtos: ProdutoTabela[] = []

  return (
    <div className="space-y-4">
      <FiltrosProdutos
        busca={busca}
        status={status}
        onBuscaChange={alterarBusca}
        onStatusChange={alterarStatus}
        onLimpar={limparFiltros}
      />
      <TabelaProdutos
        produtos={produtos}
        total={0}
        ordenacao={ordenacao}
        onOrdenacaoChange={alterarOrdenacao}
      />
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import type { FluxoProducao } from "@/features/fluxo-producao/schemas"
import type { Setor } from "@/features/setores/schemas"

type Registro = {
  id: number
  nome: string
  descricao: string | null
  ativo: boolean
  tipo?: string
}
type RegistroFluxo = Registro & { setores: { id: number; ordem: number }[] }
type Dados = { sectors: Setor[]; productionFlows: FluxoProducao[] }
type Api = ReturnType<typeof useAutenticacao>["requisitar"]

async function listar<T>(
  requisitar: Api,
  colecao: "setores" | "fluxos",
  signal: AbortSignal,
  idEmpresa: number,
) {
  const rota = colecao === "setores" ? "/api/setores" : "/api/fluxos-producao"
  const registros: T[] = []
  let totalPaginas = 1
  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    const resposta = await requisitar(`${rota}?pagina=${pagina}&limite=100`, {
      signal,
      headers: { "X-Empresa-Id": String(idEmpresa) },
    })
    if (!resposta.ok) throw new Error(await mensagemErro(resposta))
    const corpo = (await resposta.json()) as Record<typeof colecao, T[]> & {
      paginacao: { totalPaginas: number }
    }
    registros.push(...corpo[colecao])
    totalPaginas = corpo.paginacao.totalPaginas
  }
  return registros
}

function apresentar(registro: Registro) {
  return {
    id: String(registro.id),
    name: registro.nome,
    description: registro.descricao ?? "",
    status: registro.ativo ? ("Ativo" as const) : ("Inativo" as const),
  }
}

export function useConfiguracaoProducao(incluirFluxos: boolean) {
  const { empresa, requisitar } = useAutenticacao()
  const idEmpresa = empresa?.id
  const [revisao, setRevisao] = useState(0)
  const [resultado, setResultado] = useState<{
    idEmpresa: number
    revisao: number
    data: Dados | null
    error: string
  } | null>(null)

  useEffect(() => {
    if (!idEmpresa) return
    const controle = new AbortController()
    const { signal } = controle
    void Promise.all([
      listar<Registro>(requisitar, "setores", signal, idEmpresa),
      incluirFluxos
        ? listar<RegistroFluxo>(requisitar, "fluxos", signal, idEmpresa)
        : [],
    ])
      .then(([setores, fluxos]) => {
        if (signal.aborted) return
        setResultado({
          idEmpresa,
          revisao,
          error: "",
          data: {
            sectors: setores.map((setor) => ({
              ...apresentar(setor),
              type: setor.tipo ?? "Outro",
            })),
            productionFlows: fluxos.map((fluxo) => ({
              ...apresentar(fluxo),
              steps: fluxo.setores
                .toSorted((a, b) => a.ordem - b.ordem)
                .map((setor) => ({ sectorId: String(setor.id) })),
            })),
          },
        })
      })
      .catch((error: unknown) => {
        if (!signal.aborted)
          setResultado({
            idEmpresa,
            revisao,
            data: null,
            error:
              error instanceof Error
                ? error.message
                : "Não foi possível carregar os registros.",
          })
      })
    return () => controle.abort()
  }, [idEmpresa, incluirFluxos, requisitar, revisao])

  const atual =
    resultado?.idEmpresa === idEmpresa && resultado?.revisao === revisao
      ? resultado
      : null
  function reload() {
    setRevisao((valor) => valor + 1)
  }

  async function salvar(rota: string, dados: object, id?: string) {
    if (!idEmpresa) throw new Error("Selecione uma empresa ativa.")
    const resposta = await requisitar(id ? `${rota}/${id}` : rota, {
      method: id ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Empresa-Id": String(idEmpresa),
      },
      body: JSON.stringify(dados),
    })
    if (!resposta.ok) throw new Error(await mensagemErro(resposta))
    reload()
  }

  return {
    idEmpresa,
    data: atual?.data,
    error: atual?.error ?? (idEmpresa ? "" : "Selecione uma empresa ativa."),
    reload,
    async salvarFluxo(valores: Omit<FluxoProducao, "id">, id?: string) {
      const dados = {
        nome: valores.name,
        descricao: valores.description || null,
        ativo: valores.status === "Ativo",
        setores: valores.steps.map(({ sectorId }) => Number(sectorId)),
      }
      if (!id) return salvar("/api/fluxos-producao", dados)
      const anterior = atual?.data?.productionFlows.find(
        (fluxo) => fluxo.id === id,
      )
      if (!anterior) throw new Error("Recarregue o fluxo antes de editar.")
      const alteracoes = {
        ...(valores.name !== anterior.name ? { nome: dados.nome } : {}),
        ...(valores.description !== anterior.description
          ? { descricao: dados.descricao }
          : {}),
        ...(valores.status !== anterior.status ? { ativo: dados.ativo } : {}),
        ...(valores.steps.map((etapa) => etapa.sectorId).join(",") !==
        anterior.steps.map((etapa) => etapa.sectorId).join(",")
          ? { setores: dados.setores }
          : {}),
      }
      if (Object.keys(alteracoes).length)
        await salvar("/api/fluxos-producao", alteracoes, id)
    },
    alterarStatusFluxo: (id: string, ativo: boolean) =>
      salvar("/api/fluxos-producao", { ativo }, id),
  }
}

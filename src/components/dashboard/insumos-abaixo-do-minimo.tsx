"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Warehouse } from "lucide-react"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import type { InsumosAbaixoDoMinimo as DadosEstoque } from "@/lib/dashboard/tipos"
import { formatarQuantidade } from "@/lib/formatacao"
import {
  IndicadorAlerta,
  IndicadorAlertas,
  IndicadorCard,
  IndicadorIndisponivel,
  IndicadorResumo,
  IndicadorValor,
  IndicadorCardSkeleton,
} from "./indicador-card"
import {
  IndicadorDetalhes,
  IndicadorMedidor,
  IndicadorSecao,
} from "./indicador-secoes"

const base = {
  id: "indicador-insumos",
  titulo: "Estoque crítico por local",
  icone: Warehouse,
  link: { href: "/estoque", rotulo: "Ver estoque" },
}

export function InsumosAbaixoDoMinimo({ className }: { className?: string }) {
  const { estado, usuario, empresas, empresa, requisitar } = useAutenticacao()
  const chave = empresa && usuario ? `${usuario.email}:${empresa.id}` : null
  const [resultado, setResultado] = useState<{
    chave: string
    dados?: DadosEstoque
    falha?: boolean
  } | null>(null)

  useEffect(() => {
    if (estado !== "autenticado" || !chave) return
    let ativo = true
    void requisitar("/api/estoque-minimo")
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao consultar estoque.")
        const body: { indicador: DadosEstoque } = await response.json()
        if (ativo) setResultado({ chave, dados: body.indicador })
      })
      .catch(() => {
        if (ativo) setResultado({ chave, falha: true })
      })
    return () => {
      ativo = false
    }
  }, [estado, chave, requisitar])

  const dados = resultado?.chave === chave ? resultado.dados : null
  const falha = resultado?.chave === chave && resultado.falha === true

  if (
    estado === "carregando" ||
    (estado === "autenticado" && empresa && !dados && !falha)
  )
    return <IndicadorCardSkeleton className={className} />

  if (estado === "anonimo")
    return (
      <IndicadorCard {...base} className={className}>
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="underline">
            Entre
          </Link>{" "}
          para consultar o estoque.
        </p>
      </IndicadorCard>
    )

  if (!empresa)
    return (
      <IndicadorCard {...base} className={className}>
        <p className="text-sm text-muted-foreground">
          {empresas.length
            ? "Selecione uma empresa na tela de estoque."
            : "Sem acesso ao estoque em empresa ativa."}
        </p>
      </IndicadorCard>
    )

  if (falha || !dados) {
    return (
      <IndicadorIndisponivel {...base} className={className} estado="erro" />
    )
  }

  const { total, semEstoque, semMinimo, totalMonitorados, maisCriticos } = dados

  return (
    <IndicadorCard {...base} className={className}>
      <IndicadorResumo>
        <IndicadorValor
          valor={formatarQuantidade(total, 0)}
          unidade={total === 1 ? "posição" : "posições"}
        />
        {total > 0 ? (
          <IndicadorAlertas>
            <IndicadorAlerta>
              {semEstoque
                ? `${semEstoque} sem estoque físico`
                : "Há reposição necessária"}
            </IndicadorAlerta>
          </IndicadorAlertas>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma posição monitorada está no mínimo ou abaixo.
          </p>
        )}
        {!!semMinimo && (
          <IndicadorAlertas>
            <IndicadorAlerta>
              {semMinimo} {semMinimo === 1 ? "posição sem" : "posições sem"}
              {" mínimo configurado"}
            </IndicadorAlerta>
          </IndicadorAlertas>
        )}
      </IndicadorResumo>

      {maisCriticos && maisCriticos.length > 0 && (
        <IndicadorSecao titulo="Mais críticos por depósito/localização">
          <div className="flex flex-col gap-3">
            {maisCriticos.map((item) => {
              const minimo = Number(item.minimo)
              const nivel = minimo > 0 ? (Number(item.saldo) / minimo) * 100 : 0
              return (
                <IndicadorMedidor
                  key={item.id}
                  rotulo={`${item.nome} · ${item.local}`}
                  percentual={Math.round(nivel)}
                  detalhe={`${item.tipo} · Saldo ${formatarQuantidade(item.saldo)} de ${formatarQuantidade(item.minimo)} ${item.unidade} · Déficit ${formatarQuantidade(item.deficit)}`}
                />
              )
            })}
          </div>
        </IndicadorSecao>
      )}

      {(totalMonitorados !== undefined || semMinimo !== undefined) && (
        <IndicadorSecao>
          <IndicadorDetalhes
            itens={[
              ...(totalMonitorados !== undefined
                ? [
                    {
                      rotulo: "Posições monitoradas",
                      valor: formatarQuantidade(totalMonitorados, 0),
                    },
                  ]
                : []),
              ...(semMinimo !== undefined
                ? [
                    {
                      rotulo: "Sem mínimo local",
                      valor: formatarQuantidade(semMinimo, 0),
                    },
                  ]
                : []),
            ]}
          />
        </IndicadorSecao>
      )}
    </IndicadorCard>
  )
}

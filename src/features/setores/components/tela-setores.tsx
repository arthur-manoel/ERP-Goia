"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  Pencil,
  Plus,
  ShieldCheck,
  Tags,
  Trash2,
  Undo2,
  Waypoints,
} from "lucide-react"
import { toast } from "sonner"
import { ConfirmarAcao } from "@/components/dialogos/confirmar-acao"
import { PageHeader } from "@/components/layout/page-header"
import { BarraFiltros } from "@/components/listagem/barra-filtros"
import { Listagem } from "@/components/listagem/listagem"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAutenticacao } from "@/features/autenticacao/provedor-autenticacao"
import { SeletorEmpresa } from "@/features/autenticacao/seletor-empresa"
import { useListagem } from "@/hooks/use-listagem"
import { alterarStatusSetor } from "../api"
import { criarFonteSetores } from "../fonte"
import type { SetorApi } from "../tipos"
import { useTiposSetor } from "../use-tipos-setor"
import { DialogoRecursos } from "./dialogo-recursos"
import { DialogoTipos } from "./dialogo-tipos"
import { FormularioSetor } from "./formulario-setor"

const limitePorPagina = 10

function Cabecalho({ acoes }: { acoes?: React.ReactNode }) {
  return (
    <PageHeader
      titulo="Setores"
      descricao="Locais/etapas da produção, usados para montar os fluxos de produção."
      acoes={acoes}
    />
  )
}

export function TelaSetores() {
  const { estado, empresa } = useAutenticacao()

  if (estado === "carregando")
    return (
      <>
        <Cabecalho />
        <Skeleton
          role="status"
          aria-label="Carregando setores"
          className="h-80 w-full"
        />
      </>
    )
  if (estado === "anonimo")
    return (
      <>
        <Cabecalho />
        <Alert>
          <AlertDescription>
            Entre na sua conta para gerenciar setores.{" "}
            <Link href="/login" className="underline">
              Ir para o login
            </Link>
          </AlertDescription>
        </Alert>
      </>
    )
  if (!empresa)
    return (
      <>
        <Cabecalho />
        <SeletorEmpresa />
        <Alert>
          <AlertDescription>
            Selecione uma empresa para gerenciar setores.
          </AlertDescription>
        </Alert>
      </>
    )
  // Remonta ao trocar de empresa: descarta lista, filtros, tipos e diálogos
  // abertos da empresa anterior no mesmo instante, sem esperar a nova resposta.
  return <SetoresEmpresa key={empresa.id} idEmpresa={empresa.id} />
}

function SetoresEmpresa({ idEmpresa }: { idEmpresa: number }) {
  const { requisitar } = useAutenticacao()
  const fonte = useMemo(
    () => criarFonteSetores(requisitar, idEmpresa),
    [requisitar, idEmpresa],
  )
  const listagem = useListagem({ fonte, limite: limitePorPagina })
  const tipos = useTiposSetor(requisitar, idEmpresa)
  const [dialogo, setDialogo] = useState<"novo" | SetorApi | null>(null)
  const [inativando, setInativando] = useState<SetorApi | null>(null)
  const [recursosDe, setRecursosDe] = useState<SetorApi | null>(null)
  const [tiposAberto, setTiposAberto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const viva = useRef(true)
  useEffect(() => {
    viva.current = true
    return () => {
      viva.current = false
    }
  }, [])

  // Permissões vêm do servidor junto com a lista. Só orientam a interface; o
  // backend valida cada operação de novo. Sem resposta ainda = nada liberado.
  const pode = listagem.meta?.permissoes
  const administrador = listagem.meta?.administrador === true
  // Enquanto a lista carrega ou recarrega, nenhuma ação sobre linhas.
  const bloqueado =
    listagem.estado === "carregando" || listagem.atualizando || ocupado

  async function mudarStatus(setor: SetorApi, ativo: boolean) {
    setOcupado(true)
    try {
      await alterarStatusSetor(requisitar, idEmpresa, setor, ativo)
      if (!viva.current) return
      toast.success(ativo ? "Setor reativado." : "Setor inativado.")
      setInativando(null)
      listagem.recarregar()
    } catch (causa) {
      if (viva.current)
        toast.error(
          causa instanceof Error
            ? causa.message
            : "Não foi possível concluir a operação.",
        )
    } finally {
      if (viva.current) setOcupado(false)
    }
  }

  return (
    <>
      <Cabecalho
        acoes={
          <div className="flex flex-wrap gap-2">
            {administrador && (
              <Button variant="outline" onClick={() => setTiposAberto(true)}>
                <Tags /> Tipos de setor
              </Button>
            )}
            <Button
              onClick={() => setDialogo("novo")}
              disabled={!pode?.criar || bloqueado}
            >
              <Plus /> Novo setor
            </Button>
          </div>
        }
      />
      <SeletorEmpresa />

      <BarraFiltros
        listagem={listagem}
        rotuloBusca="Pesquisar setores"
        placeholderBusca="Pesquisar por nome..."
        campos={[
          {
            tipo: "selecao",
            chave: "status",
            rotulo: "Filtrar por situação",
            opcaoTodos: "Todas as situações",
            opcoes: [
              { valor: "ATIVO", rotulo: "Ativos" },
              { valor: "INATIVO", rotulo: "Inativos" },
            ],
          },
        ]}
      />

      <Listagem
        listagem={listagem}
        rotulo="Setores"
        substantivo={{ singular: "setor", plural: "setores" }}
        chaveItem={(item) => item.id}
        vazio={{
          icone: <Waypoints />,
          titulo: "Cadastre o primeiro setor",
          descricao:
            "Setores são os locais/etapas da produção (ex.: Corte, Costura, Acabamento) usados para montar os fluxos de produção.",
        }}
        colunas={[
          {
            id: "setor",
            cabecalho: "Setor",
            className: "font-medium",
            celula: (item) => item.nome,
          },
          {
            id: "tipo",
            cabecalho: "Tipo",
            className: "text-muted-foreground",
            celula: (item) => item.tipo,
          },
          {
            id: "descricao",
            cabecalho: "Descrição",
            className: "max-w-xs truncate text-muted-foreground",
            celula: (item) => item.descricao || "—",
          },
          {
            id: "status",
            cabecalho: "Status",
            celula: (item) => (
              <Badge variant={item.ativo ? "outline" : "secondary"}>
                {item.ativo ? "Ativo" : "Inativo"}
              </Badge>
            ),
          },
        ]}
        rotuloAcoesDe={(item) => `Ações para ${item.nome}`}
        acoes={[
          {
            rotulo: "Editar",
            icone: <Pencil />,
            oculta: () => !pode?.editar,
            desabilitada: () => bloqueado,
            aoSelecionar: (item) => setDialogo(item),
          },
          {
            rotulo: "Permissões do setor",
            icone: <ShieldCheck />,
            oculta: () => !administrador,
            desabilitada: () => bloqueado,
            aoSelecionar: (item) => setRecursosDe(item),
          },
          {
            rotulo: "Excluir (inativar)",
            icone: <Trash2 />,
            destrutiva: true,
            oculta: (item) => !item.ativo || !pode?.excluir,
            desabilitada: () => bloqueado,
            aoSelecionar: (item) => setInativando(item),
          },
          {
            rotulo: "Reativar",
            icone: <Undo2 />,
            oculta: (item) => item.ativo || !pode?.editar,
            desabilitada: () => bloqueado,
            aoSelecionar: (item) => void mudarStatus(item, true),
          },
        ]}
      />

      {dialogo && (
        <FormularioSetor
          setor={dialogo === "novo" ? null : dialogo}
          idEmpresa={idEmpresa}
          tipos={tipos.tipos}
          onClose={() => setDialogo(null)}
          onSaved={listagem.recarregar}
        />
      )}
      {recursosDe && (
        <DialogoRecursos
          setor={recursosDe}
          idEmpresa={idEmpresa}
          onClose={() => setRecursosDe(null)}
          onSaved={listagem.recarregar}
        />
      )}
      {tiposAberto && (
        <DialogoTipos
          idEmpresa={idEmpresa}
          tipos={tipos.tipos}
          carregando={tipos.carregando}
          erro={tipos.erro}
          onClose={() => setTiposAberto(false)}
          onChanged={tipos.recarregar}
        />
      )}
      <ConfirmarAcao
        aberto={!!inativando}
        titulo="Inativar setor?"
        descricao={
          <>
            “{inativando?.nome}” deixará de estar disponível para novos
            vínculos. O histórico será preservado e o setor pode ser reativado.
          </>
        }
        rotuloConfirmar="Inativar"
        rotuloOcupado="Inativando…"
        destrutivo
        ocupado={ocupado}
        onConfirmar={() => inativando && void mudarStatus(inativando, false)}
        onFechar={() => setInativando(null)}
      />
    </>
  )
}

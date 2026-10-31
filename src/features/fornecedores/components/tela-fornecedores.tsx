"use client"

import Link from "next/link"
import { Pencil, Plus, Trash2, Truck } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { BarraFiltros } from "@/components/listagem/barra-filtros"
import { Listagem } from "@/components/listagem/listagem"
import { ConfirmarAcao } from "@/components/dialogos/confirmar-acao"
import { PageHeader } from "@/components/layout/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  mensagemErro,
  useAutenticacao,
} from "@/features/autenticacao/provedor-autenticacao"
import { SearchSelect } from "@/features/erp/components/seletor-pesquisavel"
import { useListagem } from "@/hooks/use-listagem"
import { useObterJson } from "@/hooks/use-obter-json"
import { endpointFornecedores, criarFonteFornecedores } from "../fonte"
import { formatarCnpj } from "../regras"
import type { Fornecedor } from "../tipos"
import { FormularioFornecedor } from "./formulario-fornecedor"

const limitePorPagina = 10

function badgeStatus(status: string) {
  return (
    <Badge variant={status === "INATIVO" ? "secondary" : "outline"}>
      {status === "INATIVO" ? "Inativo" : "Ativo"}
    </Badge>
  )
}

function Cabecalho({ onNovo }: { onNovo?: () => void }) {
  return (
    <PageHeader
      titulo="Fornecedores"
      descricao="Cadastre e consulte os fornecedores da empresa."
      acoes={
        <Button onClick={onNovo} disabled={!onNovo}>
          <Plus /> Novo fornecedor
        </Button>
      }
    />
  )
}

export function TelaFornecedores() {
  const { estado, empresas, empresa, selecionarEmpresa } = useAutenticacao()

  const seletorEmpresa =
    empresas.length > 1 ? (
      <SearchSelect
        value={empresa ? String(empresa.id) : ""}
        onValueChange={(valor) => selecionarEmpresa(Number(valor))}
        label="Empresa ativa"
        className="w-full sm:w-80"
        options={empresas.map((item) => ({
          value: String(item.id),
          label: item.nome,
        }))}
      />
    ) : null

  if (estado === "carregando")
    return (
      <>
        <Cabecalho />
        <Skeleton
          role="status"
          aria-label="Carregando fornecedores"
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
            Entre na sua conta para gerenciar fornecedores.{" "}
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
        <Alert>
          <AlertDescription>
            Selecione uma empresa para gerenciar fornecedores.
          </AlertDescription>
        </Alert>
        {seletorEmpresa}
      </>
    )

  return (
    <ConteudoFornecedores
      // Remonta ao trocar de empresa: descarta a lista, a busca e fecha
      // qualquer diálogo aberto da empresa anterior.
      key={empresa.id}
      idEmpresa={empresa.id}
      seletorEmpresa={seletorEmpresa}
    />
  )
}

function ConteudoFornecedores({
  idEmpresa,
  seletorEmpresa,
}: {
  idEmpresa: number
  seletorEmpresa: React.ReactNode
}) {
  const { requisitar } = useAutenticacao()
  const obter = useObterJson()
  const fonte = useMemo(
    () => criarFonteFornecedores(obter, idEmpresa),
    [obter, idEmpresa],
  )
  const listagem = useListagem({ fonte, limite: limitePorPagina })
  // "novo" abre o cadastro; um Fornecedor abre a edição dele; null fecha.
  const [dialogo, setDialogo] = useState<"novo" | Fornecedor | null>(null)
  const [inativando, setInativando] = useState<Fornecedor | null>(null)
  const [inativandoRegistro, setInativandoRegistro] = useState(false)

  async function inativar() {
    if (!inativando) return
    setInativandoRegistro(true)
    try {
      const resposta = await requisitar(
        `${endpointFornecedores}/${inativando.id}`,
        { method: "DELETE" },
      )
      if (!resposta.ok) throw new Error(await mensagemErro(resposta))
      toast.success("Fornecedor inativado.")
      setInativando(null)
      listagem.recarregar()
    } catch (causa) {
      toast.error(
        causa instanceof Error ? causa.message : "Não foi possível inativar.",
      )
    } finally {
      setInativandoRegistro(false)
    }
  }

  return (
    <>
      <Cabecalho onNovo={() => setDialogo("novo")} />
      {seletorEmpresa}

      <BarraFiltros
        listagem={listagem}
        rotuloBusca="Buscar fornecedores"
        placeholderBusca="Buscar por razão social, fantasia, CNPJ ou e-mail..."
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
        rotulo="Fornecedores"
        substantivo={{ singular: "fornecedor", plural: "fornecedores" }}
        chaveItem={(item) => item.id}
        vazio={{
          icone: <Truck />,
          titulo: "Nenhum fornecedor encontrado",
          descricao: "Cadastre o primeiro fornecedor para começar.",
        }}
        colunas={[
          {
            id: "razao-social",
            cabecalho: "Razão social",
            celula: (item) => (
              <>
                <div className="font-medium">{item.razao_social}</div>
                {item.nome_fantasia && (
                  <div className="text-xs text-muted-foreground">
                    {item.nome_fantasia}
                  </div>
                )}
              </>
            ),
          },
          {
            id: "cnpj",
            cabecalho: "CNPJ",
            className: "font-mono text-xs tabular-nums",
            celula: (item) => formatarCnpj(item.cnpj),
          },
          {
            id: "contato",
            cabecalho: "Contato",
            celula: (item) => (
              <>
                <div>{item.email || "—"}</div>
                {item.telefone && (
                  <div className="text-xs text-muted-foreground">
                    {item.telefone}
                  </div>
                )}
              </>
            ),
          },
          {
            id: "cidade",
            cabecalho: "Cidade / UF",
            celula: (item) =>
              [item.cidade, item.estado].filter(Boolean).join(" / ") || "—",
          },
          {
            id: "situacao",
            cabecalho: "Situação",
            celula: (item) => badgeStatus(item.status),
          },
        ]}
        rotuloAcoesDe={(item) => `Ações de ${item.razao_social}`}
        acoes={[
          {
            rotulo: "Editar",
            icone: <Pencil />,
            aoSelecionar: (item) => setDialogo(item),
          },
          {
            rotulo: "Inativar",
            icone: <Trash2 />,
            destrutiva: true,
            desabilitada: (item) => item.status === "INATIVO",
            aoSelecionar: (item) => setInativando(item),
          },
        ]}
      />

      {dialogo && (
        <FormularioFornecedor
          fornecedor={dialogo === "novo" ? null : dialogo}
          idEmpresa={idEmpresa}
          onClose={() => setDialogo(null)}
          onSaved={listagem.recarregar}
        />
      )}

      <ConfirmarAcao
        aberto={!!inativando}
        titulo="Inativar fornecedor?"
        descricao={
          <>
            “{inativando?.razao_social}” deixará de estar disponível para novos
            cadastros. Os vínculos e o histórico serão preservados.
          </>
        }
        rotuloConfirmar="Inativar"
        rotuloOcupado="Inativando…"
        destrutivo
        ocupado={inativandoRegistro}
        onConfirmar={() => void inativar()}
        onFechar={() => setInativando(null)}
      />
    </>
  )
}
